import { createHash, randomBytes } from "node:crypto";
import { localGet, localSet } from "./localStore";

export type ApiTokenRecord = { id: string; label: string; tokenPrefix: string; tokenHash: string; createdAt: string; revokedAt: string | null };
const key = (userId: number) => `api-tokens:${userId}`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function createApiToken(userId: number, label: string) {
  const token = `gft_${randomBytes(24).toString("base64url")}`;
  const record: ApiTokenRecord = { id: crypto.randomUUID(), label: label.trim().slice(0, 80), tokenPrefix: token.slice(0, 12), tokenHash: hash(token), createdAt: new Date().toISOString(), revokedAt: null };
  const records = localGet<ApiTokenRecord[]>(key(userId), []);
  localSet(key(userId), [record, ...records].slice(0, 20));
  return { token, record };
}

export function listApiTokens(userId: number) {
  return localGet<ApiTokenRecord[]>(key(userId), []).map(({ tokenHash: _tokenHash, ...record }) => record);
}

export function revokeApiToken(userId: number, id: string) {
  const records = localGet<ApiTokenRecord[]>(key(userId), []);
  let revoked = false;
  localSet(key(userId), records.map((record) => record.id === id && !record.revokedAt ? (revoked = true, { ...record, revokedAt: new Date().toISOString() }) : record));
  return revoked;
}
