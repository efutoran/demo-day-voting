import { adminClient, isAdmin, unauthorized } from "@/lib/admin";

// Frees an investor's name so they can sign in on a new device. Keeps their votes.
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const { investorId } = (await req.json()) as { investorId: number };
  const { error } = await adminClient().rpc("admin_release_investor", { p_investor_id: investorId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
