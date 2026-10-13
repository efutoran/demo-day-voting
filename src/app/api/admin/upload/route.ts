import { adminClient, isAdmin, unauthorized } from "@/lib/admin";

type Payload = { slots: { label: string; teams: string[] }[]; investors: string[] };

// Wipes all slots, teams, investors and votes, then loads the new roster.
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const body = (await req.json()) as Payload;
  if (!Array.isArray(body.slots) || !Array.isArray(body.investors)) {
    return Response.json({ error: "Bad payload" }, { status: 400 });
  }
  const { error } = await adminClient().rpc("admin_load", { payload: body });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
