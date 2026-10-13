"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type Slot = { id: number; label: string; position: number };
export type Team = { id: number; slot_id: number; name: string; position: number };

/**
 * Slots, teams and live thumb counts. Counts patch in place on each vote;
 * the lineup reloads when the admin uploads a new roster.
 */
export function useLineup(onTallyChange?: () => void) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const tallyCb = useRef(onTallyChange);
  tallyCb.current = onTallyChange;

  const load = useCallback(async () => {
    const db = supabase();
    const [s, t, c] = await Promise.all([
      db.from("slots").select("id,label,position").order("position"),
      db.from("teams").select("id,slot_id,name,position").order("position"),
      db.from("team_counts").select("team_id,thumbs"),
    ]);
    setSlots(s.data ?? []);
    setTeams(t.data ?? []);
    setCounts(Object.fromEntries((c.data ?? []).map((r) => [r.team_id, r.thumbs])));
    setLoading(false);
    tallyCb.current?.();
  }, []);

  useEffect(() => {
    load();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const reloadSoon = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(load, 400);
    };
    const channel = supabase()
      .channel("lineup")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "team_counts" }, (p) => {
        const row = p.new as { team_id: number; thumbs: number };
        setCounts((prev) => ({ ...prev, [row.team_id]: row.thumbs }));
        tallyCb.current?.();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, reloadSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, reloadSoon)
      .subscribe((status) => {
        // catch up on anything missed while disconnected (phone asleep, etc.)
        if (status === "SUBSCRIBED") reloadSoon();
      });
    const onVisible = () => document.visibilityState === "visible" && reloadSoon();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase().removeChannel(channel);
    };
  }, [load]);

  return { slots, teams, counts, loading, reload: load };
}
