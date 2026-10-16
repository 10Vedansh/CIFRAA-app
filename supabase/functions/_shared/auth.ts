// Shared authentication/authorization helpers for edge functions.
// Admin authorization is decided ONLY server-side:
//   1. A request bearing the service-role key (server-to-server / scheduled jobs), or
//   2. A verified user JWT whose `sub` is listed in the ADMIN_USER_IDS secret.
// If ADMIN_USER_IDS is not configured, no user is an admin (fail closed).
// Browser-supplied roles/flags are never trusted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type AuthResult =
  | { ok: true; userId: string | null; isService: boolean }
  | { ok: false; response: Response };

function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Requires a valid signed-in user (anon key is rejected). */
export async function requireUser(req: Request): Promise<AuthResult> {
  const token = bearer(req);
  if (!token) return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") {
    return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  }
  return { ok: true, userId: String(sub), isService: false };
}

export function adminIds(): Set<string> {
  return new Set(
    (Deno.env.get("ADMIN_USER_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Requires service-role caller or a verified user listed in ADMIN_USER_IDS. */
export async function requireAdmin(req: Request): Promise<AuthResult> {
  const token = bearer(req);
  if (!token) return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && safeEqual(token, serviceKey)) return { ok: true, userId: null, isService: true };
  const user = await requireUser(req);
  if (!user.ok) return user;
  if (!adminIds().has(user.userId!)) {
    return { ok: false, response: json({ error: "Forbidden: administrator access required" }, 403) };
  }
  return user;
}
