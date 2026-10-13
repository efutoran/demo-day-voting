"use client";
import Leaderboard from "@/components/Leaderboard";
import { useLineup } from "@/lib/useLineup";

// Public leaderboard: counts only, no voter names. Good for a projector.
export default function LeaderboardPage() {
  const { slots, teams, counts, loading } = useLineup();
  return (
    <main>
      <h1>🏆 Leaderboard</h1>
      {loading ? <p className="muted">Loading…</p> : <Leaderboard slots={slots} teams={teams} counts={counts} />}
    </main>
  );
}
