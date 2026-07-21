import { requireAdmin, isDenied } from "@/lib/admin";

/* Console landing figures: platform totals, the queues that need an admin's
   attention, and 7-day activity. Counts use head+exact so Postgres returns a
   count without shipping any rows. */

export async function GET(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if (isDenied(ctx)) return ctx;
  const sb = ctx.sb;

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const count = async (
    table: string,
    build: (q: any) => any = (q) => q,
  ): Promise<number> => {
    const { count: n } = await build(sb.from(table).select("*", { count: "exact", head: true }));
    return n ?? 0;
  };

  // Account total comes from auth, not profiles: a profiles row is written
  // lazily (first role stamp, name, or saved photo), so a shopper who signed
  // up and did nothing else has none. auth.users is the only complete list.
  const accountTotal = async (): Promise<number> => {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
    return (data as any)?.total ?? data?.users?.length ?? 0;
  };

  const [
    shops, pendingShops, suspendedShops, garments, leads,
    openRequests, tryonsWeek, leadsWeek, errorsWeek, accounts,
  ] = await Promise.all([
    count("shops"),
    count("shops", (q) => q.eq("status", "pending")),
    count("shops", (q) => q.eq("status", "suspended")),
    count("garments"),
    count("leads"),
    count("plan_requests", (q) => q.eq("status", "open")),
    count("tryon_events", (q) => q.gte("created_at", weekAgo)),
    count("leads", (q) => q.gte("created_at", weekAgo)),
    count("error_logs", (q) => q.gte("created_at", weekAgo)),
    accountTotal(),
  ]);

  // One shop per vendor account (see schema.sql), so the shop count is the
  // vendor count — and it beats profiles.role, which a pre-profiles vendor may
  // still have stamped 'shopper'.
  return Response.json({
    totals: {
      shops,
      garments,
      leads,
      accounts,
      vendors: shops,
      shoppers: Math.max(accounts - shops, 0),
    },
    queues: { pendingShops, suspendedShops, openRequests },
    week: { tryons: tryonsWeek, leads: leadsWeek, errors: errorsWeek },
  });
}
