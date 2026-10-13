"use client";
import { useMemo, useState } from "react";
import type { Slot, Team } from "@/lib/useLineup";

type Props = {
  slots: Slot[];
  teams: Team[];
  counts: Record<number, number>;
  highlight?: Set<number>;
};

export default function Leaderboard({ slots, teams, counts, highlight }: Props) {
  const [slotId, setSlotId] = useState<number | "all">("all");

  const ranked = useMemo(() => {
    const list = teams
      .filter((t) => slotId === "all" || t.slot_id === slotId)
      .map((t) => ({ ...t, thumbs: counts[t.id] ?? 0 }))
      .sort((a, b) => b.thumbs - a.thumbs || a.name.localeCompare(b.name));
    // ties share a rank: 1, 2, 2, 4
    let rank = 0;
    return list.map((t, i) => {
      if (i === 0 || t.thumbs !== list[i - 1].thumbs) rank = i + 1;
      return { ...t, rank };
    });
  }, [teams, counts, slotId]);

  const max = Math.max(1, ...ranked.map((t) => t.thumbs));
  const slotLabel = (id: number) => slots.find((s) => s.id === id)?.label ?? "";

  return (
    <>
      <div className="chips">
        <button className={`chip ${slotId === "all" ? "on" : ""}`} onClick={() => setSlotId("all")}>
          All teams
        </button>
        {slots.map((s) => (
          <button key={s.id} className={`chip ${slotId === s.id ? "on" : ""}`} onClick={() => setSlotId(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {ranked.length === 0 && <p className="muted">No teams yet.</p>}
      <div className="card" style={{ padding: 0 }}>
        {ranked.map((t) => (
          <div
            key={t.id}
            className={`lb-row ${t.rank <= 3 && t.thumbs > 0 ? "top" : ""}`}
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <div className="lb-rank">{t.rank}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="team-name">
                {t.name}
                {highlight?.has(t.id) && <span title="You voted"> 👍</span>}
              </div>
              {slotId === "all" && <div className="muted small">{slotLabel(t.slot_id)}</div>}
              <div className="bar" style={{ width: `${(t.thumbs / max) * 100}%` }} />
            </div>
            <div className="lb-count">{t.thumbs}</div>
          </div>
        ))}
      </div>
    </>
  );
}
