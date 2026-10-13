"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLineup } from "@/lib/useLineup";

// Team screen: a team's live thumb count. Never shows who voted.
function TeamScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { slots, teams, counts, loading } = useLineup();
  const teamId = Number(params.get("id"));
  const team = teams.find((t) => t.id === teamId);

  if (loading) return <main><p className="muted">Loading…</p></main>;

  if (!team) {
    return (
      <main>
        <h1>Pick your team</h1>
        {slots.map((s) => (
          <div key={s.id}>
            <h2>{s.label}</h2>
            <ul className="name-list">
              {teams.filter((t) => t.slot_id === s.id).map((t) => (
                <li key={t.id}>
                  <button onClick={() => router.push(`/team?id=${t.id}`)}>{t.name}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!teams.length && <p className="muted">No teams yet.</p>}
      </main>
    );
  }

  return (
    <main>
      <div className="row">
        <button className="link-btn small" onClick={() => router.push("/team")}>← All teams</button>
        <span className="spacer" />
        <a className="small" href="/leaderboard">Leaderboard</a>
      </div>
      <div className="big-name">{team.name}</div>
      <div className="muted" style={{ textAlign: "center" }}>
        {slots.find((s) => s.id === team.slot_id)?.label}
      </div>
      <div className="big-count" style={{ marginTop: 32 }}>{counts[team.id] ?? 0}</div>
      <div className="muted" style={{ textAlign: "center", fontSize: 20 }}>👍 thumbs up</div>
    </main>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamScreen />
    </Suspense>
  );
}
