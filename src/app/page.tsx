"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import { supabase } from "@/lib/supabase";
import { useLineup } from "@/lib/useLineup";

type Investor = { id: number; name: string; claimed?: boolean };
type Vote = { investor_id: number; team_id: number };

export default function InvestorApp() {
  const [me, setMe] = useState<Investor | null>(null);
  const [checking, setChecking] = useState(true);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<"vote" | "leaderboard">("vote");
  const [votes, setVotes] = useState<Vote[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Who am I, and who voted for what. Runs on load and whenever a tally changes.
  const refresh = useCallback(async () => {
    const db = supabase();
    const { data: session } = await db.auth.getSession();
    if (!session.session) {
      setMe(null);
      setChecking(false);
      return;
    }
    const { data: mine } = await db.rpc("my_investor");
    const current = (mine as Investor[] | null)?.[0] ?? null;
    setMe(current);
    setChecking(false);
    if (!current) return;
    const [v, i] = await Promise.all([
      db.from("votes").select("investor_id,team_id"),
      db.from("investors").select("id,name"),
    ]);
    setVotes(v.data ?? []);
    setNames(Object.fromEntries((i.data ?? []).map((r) => [r.id, r.name])));
  }, []);

  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  const { slots, teams, counts, loading } = useLineup(refreshSoon);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const myVotes = useMemo(
    () => new Set(votes.filter((v) => v.investor_id === me?.id).map((v) => v.team_id)),
    [votes, me],
  );

  async function toggle(teamId: number) {
    if (!me) return;
    setError("");
    const db = supabase();
    const had = myVotes.has(teamId);
    // optimistic
    setVotes((prev) =>
      had
        ? prev.filter((v) => !(v.investor_id === me.id && v.team_id === teamId))
        : [...prev, { investor_id: me.id, team_id: teamId }],
    );
    const { error } = had
      ? await db.from("votes").delete().match({ investor_id: me.id, team_id: teamId })
      : await db.from("votes").insert({ investor_id: me.id, team_id: teamId });
    if (error && error.code !== "23505") {
      setError("Couldn't save that vote. Check your connection and try again.");
      refresh();
    }
  }

  if (checking) return <main><p className="muted">Loading…</p></main>;

  if (!me || picking) {
    return (
      <NamePicker
        onCancel={me ? () => setPicking(false) : undefined}
        onPicked={(inv) => {
          setMe(inv);
          setPicking(false);
          refresh();
        }}
      />
    );
  }

  return (
    <main>
      <div className="row">
        <h1>{tab === "vote" ? "Vote" : "Leaderboard"}</h1>
        <span className="spacer" />
        <span className="small muted">{me.name} · </span>
        <button className="link-btn small" onClick={() => setPicking(true)}>Not you?</button>
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "vote" ? (
        <VoteView
          slots={slots}
          teams={teams}
          counts={counts}
          votes={votes}
          names={names}
          myVotes={myVotes}
          loading={loading}
          onToggle={toggle}
        />
      ) : (
        <Leaderboard slots={slots} teams={teams} counts={counts} highlight={myVotes} />
      )}

      <nav className="tabbar">
        <button className={tab === "vote" ? "on" : ""} onClick={() => setTab("vote")}>
          👍 Vote {myVotes.size > 0 && `(${myVotes.size})`}
        </button>
        <button className={tab === "leaderboard" ? "on" : ""} onClick={() => setTab("leaderboard")}>
          🏆 Leaderboard
        </button>
      </nav>
    </main>
  );
}

function VoteView(props: {
  slots: { id: number; label: string }[];
  teams: { id: number; slot_id: number; name: string }[];
  counts: Record<number, number>;
  votes: Vote[];
  names: Record<number, string>;
  myVotes: Set<number>;
  loading: boolean;
  onToggle: (teamId: number) => void;
}) {
  const { slots, teams, counts, votes, names, myVotes, loading, onToggle } = props;
  const [slotId, setSlotId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (slots.length && !slots.some((s) => s.id === slotId)) setSlotId(slots[0].id);
  }, [slots, slotId]);

  if (loading) return <p className="muted">Loading teams…</p>;
  if (!slots.length) return <p className="muted">No teams yet. Check back soon.</p>;

  const shown = teams.filter((t) => t.slot_id === slotId);

  return (
    <>
      <div className="chips">
        {slots.map((s) => (
          <button key={s.id} className={`chip ${s.id === slotId ? "on" : ""}`} onClick={() => setSlotId(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {shown.map((t) => {
        const voters = votes.filter((v) => v.team_id === t.id).map((v) => names[v.investor_id]).filter(Boolean);
        const on = myVotes.has(t.id);
        return (
          <div key={t.id} className="card">
            <div className="team">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="team-name">{t.name}</div>
                {voters.length > 0 && (
                  <button className="link-btn small" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    {open === t.id ? "Hide" : "See"} who
                  </button>
                )}
              </div>
              <button
                className={`thumb ${on ? "on" : ""}`}
                aria-pressed={on}
                aria-label={on ? `Remove thumbs up for ${t.name}` : `Thumbs up ${t.name}`}
                onClick={() => onToggle(t.id)}
              >
                👍 {counts[t.id] ?? 0}
              </button>
            </div>
            {open === t.id && <div className="voters">{voters.sort().join(", ")}</div>}
          </div>
        );
      })}
    </>
  );
}

function NamePicker({ onPicked, onCancel }: { onPicked: (i: Investor) => void; onCancel?: () => void }) {
  const [list, setList] = useState<Investor[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase()
      .from("investors")
      .select("id,name,claimed")
      .order("name")
      .then(({ data }) => setList(data ?? []));
  }, []);

  async function pick(inv: Investor) {
    if (!confirm(`Sign in as ${inv.name}?`)) return;
    setBusy(true);
    setError("");
    const db = supabase();
    const { data: s } = await db.auth.getSession();
    if (!s.session) {
      const { error } = await db.auth.signInAnonymously();
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
    }
    const { error } = await db.rpc("claim_investor", { p_investor_id: inv.id });
    setBusy(false);
    if (error) setError(error.message);
    else onPicked(inv);
  }

  const shown = list.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main>
      <div className="row">
        <h1>Who are you?</h1>
        <span className="spacer" />
        {onCancel && <button className="link-btn" onClick={onCancel}>Cancel</button>}
      </div>
      <input type="search" placeholder="Search your name" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="error">{error}</p>}
      {list.length === 0 && <p className="muted">The investor list hasn&apos;t been uploaded yet.</p>}
      <ul className="name-list">
        {shown.map((i) => (
          <li key={i.id}>
            <button disabled={busy} onClick={() => pick(i)}>
              {i.name}
              {i.claimed && <span className="muted small"> · signed in elsewhere</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="small muted">
        Teams: see your live count on the <a href="/team">team screen</a>. Everyone:{" "}
        <a href="/leaderboard">leaderboard</a>.
      </p>
    </main>
  );
}
