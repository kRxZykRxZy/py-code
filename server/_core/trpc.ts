import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
type RateLimitBucket = { count: number; resetAt: number };
const rateLimits = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

function getRateLimitKey(ctx: TrpcContext) {
  if (ctx.user?.openId) return `user:${ctx.user.openId}`;
  const forwarded = ctx.req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : ctx.req.ip || "unknown";
  return `ip:${ip}`;
}

const enforceRateLimit = t.middleware(async ({ ctx, next }) => {
  const now = Date.now();
  const key = getRateLimitKey(ctx);
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    if (current.count >= RATE_LIMIT_MAX_REQUESTS) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please try again in a minute." });
    current.count += 1;
  }
  if (rateLimits.size > 2_000) for (const [entryKey, bucket] of Array.from(rateLimits.entries())) if (bucket.resetAt <= now) rateLimits.delete(entryKey);
  return next();
});

export const resetRateLimitsForTests = () => rateLimits.clear();
export const publicProcedure = t.procedure.use(enforceRateLimit);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceRateLimit).use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
