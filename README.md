# Demo Day Voting

Live thumbs-up voting for a demo day. Investors pick their name and thumb up teams. Teams see only their count, never who voted.

Stack: Next.js (hosted on Vercel) + Supabase (Postgres, Realtime, Anonymous Auth). Free tiers cover about 100 investors and 40 teams.

## Pages

| URL | Who | What |
|---|---|---|
| `/` | Investors | Pick your name, thumb up teams by time slot, see who voted, Leaderboard tab |
| `/leaderboard` | Anyone / projector | Ranked thumb counts, all teams or by slot. No names |
| `/team` | Teams | Pick your team, see a big live count. No names |
| `/admin` | Organizer | Upload roster CSV (resets everything), live leaderboard, vote log, export, release names |

## Setup (about 15 minutes)

### 1. Supabase
1. Create a project at https://supabase.com (free tier is fine).
2. **SQL Editor** → paste `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins**.
4. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key.

> Free projects pause after about a week without use. Open the app before class, or upgrade to Pro for the term.

### 2. Vercel
1. Make sure this repo is on GitHub.
2. Import it at https://vercel.com/new.
3. Add environment variables (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
4. Deploy.

### 3. Load your roster
Open `/admin`, enter the admin password, and upload a CSV:

```csv
type,name,slot
team,Acme Robotics,10:00 AM
team,BetaPay,10:00 AM
team,Driftwood AI,10:30 AM
investor,Jane Smith,
investor,Raj Patel,
```

- `type` is `team` or `investor`. Teams need a `slot`; slots show in the order they first appear.
- **Every upload wipes all teams, investors and votes.** Export results first if you need them.
- A sample is at `public/sample-roster.csv`.

## How privacy works

- Votes live in `votes`. Database row-level security lets only signed-in investors read it. Team screens and the public leaderboard can't read it.
- Teams and the leaderboard read `team_counts`, which a database trigger keeps up to date.
- `votes` is not broadcast over Realtime, because Supabase's DELETE events skip row-level security. Investor screens re-fetch votes when a count changes.

## Sign-in model

Investors tap their name. The first device to pick a name holds it. If someone switches phones, use **Release** next to their name in `/admin`; their votes are kept. Anyone could still pick a name nobody has claimed yet. For a class that's an acceptable trade-off for one-tap sign-in.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
```
