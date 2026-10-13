-- Demo Day Voting schema. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run: drops and recreates everything.

drop table if exists votes, team_counts, teams, slots, investors cascade;

create table slots (
  id       bigint generated always as identity primary key,
  label    text not null,
  position int  not null
);

create table teams (
  id       bigint generated always as identity primary key,
  slot_id  bigint not null references slots on delete cascade,
  name     text   not null,
  position int    not null
);

create table investors (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  -- the anonymous Supabase user that picked this name; one device per name
  auth_uid uuid unique,
  claimed  boolean generated always as (auth_uid is not null) stored
);

create table votes (
  investor_id bigint not null references investors on delete cascade,
  team_id     bigint not null references teams on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (investor_id, team_id)
);

-- Public tally. Teams and the leaderboard read this, never `votes`.
create table team_counts (
  team_id bigint primary key references teams on delete cascade,
  thumbs  int not null default 0
);

create index on teams (slot_id);
create index on votes (team_id);

-- ---------------------------------------------------------------- triggers

create or replace function on_team_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_counts (team_id) values (new.id);
  return new;
end $$;

create trigger team_insert after insert on teams
  for each row execute function on_team_insert();

create or replace function on_vote_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update team_counts set thumbs = thumbs + 1 where team_id = new.team_id;
  else
    update team_counts set thumbs = thumbs - 1 where team_id = old.team_id;
  end if;
  return null;
end $$;

create trigger vote_change after insert or delete on votes
  for each row execute function on_vote_change();

-- ---------------------------------------------------------------- helpers

create or replace function current_investor_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from investors where auth_uid = auth.uid()
$$;

-- Returns the investor this device has picked, if any.
create or replace function my_investor() returns table (id bigint, name text)
language sql stable security definer set search_path = public as $$
  select id, name from investors where auth_uid = auth.uid()
$$;

-- "Pick your name". Releases any name this device held before.
create or replace function claim_investor(p_investor_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update investors set auth_uid = null
    where auth_uid = auth.uid() and id <> p_investor_id;
  update investors set auth_uid = auth.uid()
    where id = p_investor_id and (auth_uid is null or auth_uid = auth.uid());
  if not found then
    raise exception 'That name is already in use on another device. Ask the organizer to release it.';
  end if;
end $$;

-- Wipes everything and loads a fresh roster. Called only by the admin API.
-- payload: {"slots":[{"label":"10:00","teams":["Acme","Beta"]}], "investors":["Jane Smith"]}
create or replace function admin_load(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s   jsonb;
  t   jsonb;
  sid bigint;
  si  int := 0;
  ti  int;
begin
  -- delete (not truncate) so realtime clients see the reset
  delete from votes where true;
  delete from slots where true;      -- cascades teams, team_counts
  delete from investors where true;

  for s in select * from jsonb_array_elements(payload -> 'slots') loop
    insert into slots (label, position) values (s ->> 'label', si) returning id into sid;
    si := si + 1;
    ti := 0;
    for t in select * from jsonb_array_elements(s -> 'teams') loop
      insert into teams (slot_id, name, position) values (sid, t #>> '{}', ti);
      ti := ti + 1;
    end loop;
  end loop;

  insert into investors (name)
    select distinct value #>> '{}' from jsonb_array_elements(payload -> 'investors');
end $$;

create or replace function admin_release_investor(p_investor_id bigint) returns void
language sql security definer set search_path = public as $$
  update investors set auth_uid = null where id = p_investor_id
$$;

revoke execute on function admin_load(jsonb), admin_release_investor(bigint)
  from public, anon, authenticated;
grant execute on function admin_load(jsonb), admin_release_investor(bigint) to service_role;

-- ---------------------------------------------------------------- security

alter table slots       enable row level security;
alter table teams       enable row level security;
alter table investors   enable row level security;
alter table votes       enable row level security;
alter table team_counts enable row level security;

-- Anyone (teams, leaderboard screens) can read the lineup and the tallies.
create policy "read slots"  on slots       for select to anon, authenticated using (true);
create policy "read teams"  on teams       for select to anon, authenticated using (true);
create policy "read counts" on team_counts for select to anon, authenticated using (true);

-- Names are public for the picker; auth_uid is never exposed.
create policy "read investors" on investors for select to anon, authenticated using (true);
revoke select on investors from anon, authenticated;
grant select (id, name, claimed) on investors to anon, authenticated;
revoke insert, update, delete on investors from anon, authenticated;
revoke insert, update, delete on team_counts from anon, authenticated;

-- Only signed-in investors can see who voted. Teams (anon) cannot.
create policy "investors read votes" on votes for select to authenticated
  using (current_investor_id() is not null);
create policy "vote as yourself" on votes for insert to authenticated
  with check (investor_id = current_investor_id());
create policy "unvote as yourself" on votes for delete to authenticated
  using (investor_id = current_investor_id());

-- ---------------------------------------------------------------- realtime

-- `votes` and `investors` are deliberately NOT published: realtime DELETE events
-- bypass RLS and would reveal voter ids to team screens. Clients refetch votes
-- when a tally changes instead.
alter publication supabase_realtime add table slots, teams, team_counts;
