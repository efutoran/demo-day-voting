import { adminClient, isAdmin, unauthorized } from "@/lib/admin";

// Full vote log with names, plus investor sign-in status.
export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const db = adminClient();
  const [votes, investors] = await Promise.all([
    db
      .from("votes")
      .select("created_at, investors(name), teams(name, slots(label))")
      .order("created_at", { ascending: false }),
    db.from("investors").select("id,name,claimed").order("name"),
  ]);
  const error = votes.error ?? investors.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ votes: votes.data, investors: investors.data });
}
