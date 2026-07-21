import { requireAdmin, isDenied } from "@/lib/admin";

/* Cheap identity probe. The admin shell calls this once on mount to decide
   between the console and a sign-in / not-an-admin notice, so that every page
   below it can assume the caller is authorized. */

export async function GET(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if (isDenied(ctx)) return ctx;
  return Response.json({ email: ctx.email });
}
