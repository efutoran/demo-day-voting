"use client";
import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import Leaderboard from "@/components/Leaderboard";
import { useLineup } from "@/lib/useLineup";

type Roster = { slots: { label: string; teams: string[] }[]; investors: string[] };
type VoteRow = {
  created_at: string;
  investors: { name: string } | null;
  teams: { name: string; slots: { label: string } | null } | null;
};
type InvestorRow = { id: number; name: string; claimed: boolean };

const PW_KEY = "admin-password";

// CSV columns: type,name,slot   (type = team | investor; slot only for teams)
function parseRoster(text: string): { roster?: Roster; error?: string } {
  const { data, errors } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (errors.length) return { error: `CSV error on row ${errors[0].row}: ${errors[0].message}` };

  const slots: Roster["slots"] = [];
  const investors = new Set<string>();
  for (const [i, raw] of data.entries()) {
    const type = (raw.type ?? "").trim().toLowerCase();
    const name = (raw.name ?? "").trim();
    const slot = (raw.slot ?? "").trim();
    const line = i + 2;
    if (!name) return { error: `Row ${line}: missing name` };
    if (type === "investor") {
      investors.add(name);
    } else if (type === "team") {
      if (!slot) return { error: `Row ${line}: team "${name}" has no slot` };
      let s = slots.find((x) => x.label === slot);
      if (!s) slots.push((s = { label: slot, teams: [] }));
      s.teams.push(name);
    } else {
      return { error: `Row ${line}: type must be "team" or "investor", got "${raw.type ?? ""}"` };
    }
  }
  if (!slots.length) return { error: "No teams found in the CSV" };
  if (!investors.size) return { error: "No investors found in the CSV" };
  return { roster: { slots, investors: [...investors] } };
}

function toCsv(rows: string[][]) {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [investors, setInvestors] = useState<InvestorRow[]>([]);
  const [busy, setBusy] = useState(false);

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, {
        ...init,
        headers: { "content-type": "application/json", "x-admin-password": pw, ...init?.headers },
      }),
    [pw],
  );

  const loadVotes = useCallback(async () => {
    const res = await api("/api/admin/votes");
    if (res.status === 401) {
      setAuthed(false);
      setError("Wrong admin password");
      return;
    }
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setAuthed(true);
    try { sessionStorage.setItem(PW_KEY, pw); } catch {}
    setVotes(body.votes);
    setInvestors(body.investors);
  }, [api, pw]);

  const { slots, teams, counts } = useLineup(authed ? loadVotes : undefined);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PW_KEY);
      if (saved) setPw(saved);
    } catch {}
  }, []);

  async function onFile(file: File) {
    setMsg("");
    setError("");
    const { roster, error } = parseRoster(await file.text());
    if (error) setError(error);
    setRoster(roster ?? null);
  }

  async function upload() {
    if (!roster) return;
    if (!confirm("This erases ALL teams, investors and votes, then loads the new CSV. Continue?")) return;
    setBusy(true);
    const res = await api("/api/admin/upload", { method: "POST", body: JSON.stringify(roster) });
    setBusy(false);
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setRoster(null);
    setMsg("Roster loaded. Everything was reset.");
    loadVotes();
  }

  async function release(inv: InvestorRow) {
    if (!confirm(`Let ${inv.name} sign in again on a new device? Their votes are kept.`)) return;
    const res = await api("/api/admin/release", { method: "POST", body: JSON.stringify({ investorId: inv.id }) });
    if (!res.ok) setError((await res.json()).error);
    loadVotes();
  }

  function exportResults() {
    const slotLabel = (id: number) => slots.find((s) => s.id === id)?.label ?? "";
    const tally = [...teams]
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .map((t) => [t.name, slotLabel(t.slot_id), String(counts[t.id] ?? 0)]);
    download("results.csv", toCsv([["team", "slot", "thumbs"], ...tally]));
  }

  function exportVotes() {
    const rows = votes.map((v) => [
      v.investors?.name ?? "",
      v.teams?.name ?? "",
      v.teams?.slots?.label ?? "",
      v.created_at,
    ]);
    download("votes.csv", toCsv([["investor", "team", "slot", "voted_at"], ...rows]));
  }

  if (!authed) {
    return (
      <main>
        <h1>Admin</h1>
        <form onSubmit={(e) => { e.preventDefault(); setError(""); loadVotes(); }}>
          <input type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn primary" style={{ marginTop: 10 }}>Sign in</button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const signedIn = investors.filter((i) => i.claimed).length;

  return (
    <main>
      <h1>Admin</h1>
      {error && <p className="error">{error}</p>}
      {msg && <p>{msg}</p>}

      <h2>Upload roster (resets everything)</h2>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          CSV columns: <code>type,name,slot</code>. Type is <code>team</code> or <code>investor</code>.
          Teams need a slot (e.g. <code>10:00 AM</code>); slots appear in the order they first show up.{" "}
          <a href="/sample-roster.csv" download>Sample CSV</a>
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {roster && (
          <>
            <p>
              Ready: <b>{roster.slots.reduce((n, s) => n + s.teams.length, 0)}</b> teams in{" "}
              <b>{roster.slots.length}</b> slots, <b>{roster.investors.length}</b> investors.
            </p>
            <button className="btn primary" disabled={busy} onClick={upload}>
              {busy ? "Loading…" : "Reset and load"}
            </button>
          </>
        )}
      </div>

      <h2>Leaderboard</h2>
      <Leaderboard slots={slots} teams={teams} counts={counts} />
      <div className="row">
        <button className="btn" onClick={exportResults}>Export results CSV</button>
        <button className="btn" onClick={exportVotes}>Export votes CSV</button>
      </div>

      <h2>Votes ({votes.length})</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Investor</th><th>Team</th><th>Time</th></tr></thead>
          <tbody>
            {votes.map((v, i) => (
              <tr key={i}>
                <td>{v.investors?.name}</td>
                <td>{v.teams?.name}</td>
                <td className="muted">{new Date(v.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Investors ({signedIn}/{investors.length} signed in)</h2>
      <div className="card">
        <table>
          <tbody>
            {investors.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="muted">{i.claimed ? "signed in" : "not yet"}</td>
                <td style={{ textAlign: "right" }}>
                  {i.claimed && <button className="link-btn small" onClick={() => release(i)}>Release</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
