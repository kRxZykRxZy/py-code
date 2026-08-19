import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { githubConnections, profiles, subscriptions, webhookDeliveries } from "../drizzle/schema";
import { getDb } from "./db";

const PADDLE_MAX_AGE_SECONDS = 300;
const localDeliveries = new Set<string>();

type PaddleData = {
  id?: string;
  subscription_id?: string;
  customer_id?: string;
  status?: string;
  next_billed_at?: string | null;
  custom_data?: Record<string, unknown> | null;
};

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleData;
};

function secureEqual(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function verifyPaddleSignature(rawBody: string, signatureHeader: string | undefined, secret = process.env.PADDLE_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(";").reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) (acc[key] ||= []).push(value);
    return acc;
  }, {});
  const timestamp = parts.ts?.[0];
  if (!timestamp || !parts.h1?.length || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(now - Number(timestamp) * 1000);
  if (age > PADDLE_MAX_AGE_SECONDS * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`, "utf8").digest("hex");
  return parts.h1.some((signature) => /^[a-f0-9]{64}$/i.test(signature) && secureEqual(expected, signature));
}

export function verifyGitHubSignature(rawBody: string, signatureHeader: string | undefined, secret = process.env.GITHUB_WEBHOOK_SECRET) {
  if (!secret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  return secureEqual(expected, signatureHeader);
}

export function paddleLifecycleStatus(eventType: string, data: PaddleData) {
  if (["active", "trialing", "past_due", "paused", "canceled"].includes(data.status || "")) return data.status!;
  if (["subscription.past_due", "transaction.past_due", "transaction.payment_failed"].includes(eventType)) return "past_due";
  if (["subscription.paused"].includes(eventType)) return "paused";
  if (["subscription.canceled", "transaction.canceled"].includes(eventType)) return "canceled";
  if (["subscription.created", "subscription.activated", "subscription.resumed", "subscription.updated", "transaction.completed", "transaction.paid"].includes(eventType)) return data.status === "trialing" ? "trialing" : "active";
  return data.status || "inactive";
}

function planFromData(data: PaddleData, fallback: "free" | "pro" | "proPlus" = "free") {
  const value = String(data.custom_data?.githubfolio_plan || data.custom_data?.plan || fallback);
  return value === "pro" || value === "proPlus" ? value : fallback;
}

function userIdFromData(data: PaddleData) {
  const value = data.custom_data?.githubfolio_user_id ?? data.custom_data?.user_id;
  const userId = typeof value === "number" ? value : Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

type DeliveryLease = { accepted: boolean; id?: number };

async function beginDelivery(provider: "paddle" | "github", eventId: string, eventType: string, payload: string): Promise<DeliveryLease> {
  const key = `${provider}:${eventId}`;
  if (localDeliveries.has(key)) return { accepted: false };
  const db = await getDb();
  if (db) {
    const existing = await db.select({ id: webhookDeliveries.id, status: webhookDeliveries.status }).from(webhookDeliveries).where(and(eq(webhookDeliveries.provider, provider), eq(webhookDeliveries.eventId, eventId))).limit(1);
    if (existing[0]?.status !== "failed") return { accepted: false };
    if (existing[0]) {
      await db.update(webhookDeliveries).set({ status: "processing", processedAt: new Date() }).where(eq(webhookDeliveries.id, existing[0].id));
      return { accepted: true, id: existing[0].id };
    }
    try {
      const inserted = await db.insert(webhookDeliveries).values({ provider, eventId, eventType, status: "processing", payload });
      return { accepted: true, id: Number(inserted[0].insertId) };
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") return { accepted: false };
      throw error;
    }
  }
  localDeliveries.add(key);
  return { accepted: true };
}

async function completeDelivery(delivery: DeliveryLease, status: "processed" | "queued") {
  if (!delivery.id) return;
  const db = await getDb();
  if (db) await db.update(webhookDeliveries).set({ status, processedAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
}

async function failDelivery(delivery: DeliveryLease) {
  if (!delivery.id) return;
  const db = await getDb();
  if (db) await db.update(webhookDeliveries).set({ status: "failed", processedAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
}

async function applyPaddleEvent(event: PaddleEvent) {
  const eventType = event.event_type || "unknown";
  const data = event.data || {};
  const db = await getDb();
  const userId = userIdFromData(data);
  if (!db) throw new Error("database-unavailable");
  if (!userId) return { applied: false, reason: "missing-githubfolio-user-id" };

  const existing = (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1))[0];
  const subscriptionId = data.id?.startsWith("sub_") ? data.id : data.subscription_id;
  const nextStatus = paddleLifecycleStatus(eventType, data);
  const values = {
    userId,
    paddleCustomerId: data.customer_id || existing?.paddleCustomerId || null,
    paddleSubscriptionId: subscriptionId || existing?.paddleSubscriptionId || null,
    plan: planFromData(data, existing?.plan || "free"),
    status: nextStatus,
    managedDomainAddOn: Boolean(data.custom_data?.githubfolio_managed_domain ?? existing?.managedDomainAddOn),
    managedDomainName: existing?.managedDomainName || null,
    managedDomainStatus: existing?.managedDomainStatus || "none",
    renewsAt: data.next_billed_at ? new Date(data.next_billed_at) : existing?.renewsAt || null,
  } as const;
  if (existing) await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  else await db.insert(subscriptions).values(values);
  return { applied: true, status: nextStatus, userId };
}

export const paddleWebhookHandler: RequestHandler = async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(500).json({ error: "raw-body-required" });
    const rawBody = req.body.toString("utf8");
    const signature = typeof req.headers["paddle-signature"] === "string" ? req.headers["paddle-signature"] : undefined;
    if (!verifyPaddleSignature(rawBody, signature)) return res.status(401).json({ error: "invalid-paddle-signature" });
    const event = JSON.parse(rawBody) as PaddleEvent;
    if (!event.event_id || !event.event_type) return res.status(400).json({ error: "invalid-paddle-event" });
    const delivery = await beginDelivery("paddle", event.event_id, event.event_type, rawBody);
    if (!delivery.accepted) return res.status(200).json({ ok: true, duplicate: true });
    let result;
    try {
      result = await applyPaddleEvent(event);
      await completeDelivery(delivery, "processed");
    } catch (error) {
      await failDelivery(delivery);
      throw error;
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[Paddle webhook] processing failed", error);
    return res.status(500).json({ error: "paddle-webhook-processing-failed" });
  }
};

export const githubWebhookHandler: RequestHandler = async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(500).json({ error: "raw-body-required" });
    const rawBody = req.body.toString("utf8");
    const signature = typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : undefined;
    if (!verifyGitHubSignature(rawBody, signature)) return res.status(401).json({ error: "invalid-github-signature" });
    const eventType = typeof req.headers["x-github-event"] === "string" ? req.headers["x-github-event"] : "unknown";
    const eventId = typeof req.headers["x-github-delivery"] === "string" ? req.headers["x-github-delivery"] : "";
    if (!eventId || !["push", "repository", "installation", "installation_repositories"].includes(eventType)) return res.status(202).json({ ok: true, ignored: true });
    const delivery = await beginDelivery("github", eventId, eventType, rawBody);
    if (!delivery.accepted) return res.status(200).json({ ok: true, duplicate: true });
    const payload = JSON.parse(rawBody) as { repository?: { owner?: { login?: string } }; installation?: { account?: { login?: string } } };
    const githubLogin = payload.repository?.owner?.login || payload.installation?.account?.login;
    const db = await getDb();
    if (db && githubLogin) {
      const profile = (await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.githubLogin, githubLogin)).limit(1))[0];
      if (profile) await db.update(githubConnections).set({ syncedAt: new Date(0) }).where(eq(githubConnections.userId, profile.userId));
    }
    await completeDelivery(delivery, "queued");
    return res.status(202).json({ ok: true, queued: true, eventType });
  } catch (error) {
    console.error("[GitHub webhook] processing failed", error);
    return res.status(500).json({ error: "github-webhook-processing-failed" });
  }
};
