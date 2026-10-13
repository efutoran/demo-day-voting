import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && req.headers.get("x-admin-password") === expected;
}

export const unauthorized = () =>
  Response.json({ error: "Wrong admin password" }, { status: 401 });
