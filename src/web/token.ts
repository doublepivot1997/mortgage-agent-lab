import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Signed, compressed session tokens. The browser holds the conversation state between
 * requests; the server verifies the signature so the history can't be edited client-side.
 * (Not encrypted: it contains only what the visitor typed and what the agent replied.)
 */

let devSecret: string | null = null;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) must be set in production");
  devSecret ??= randomBytes(32).toString("hex"); // dev only: tokens reset when the server restarts
  return devSecret;
}

const sign = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export function encodeToken(payload: unknown, key = secret()): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export class TokenError extends Error {}

export function decodeToken<T>(token: string, key = secret(), maxBytes = 2_000_000): T {
  if (typeof token !== "string" || token.length > maxBytes) throw new TokenError("token missing or too large");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new TokenError("malformed token");
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, key));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) throw new TokenError("bad signature");
  try {
    return JSON.parse(inflateRawSync(Buffer.from(body, "base64url"), { maxOutputLength: 5_000_000 }).toString()) as T;
  } catch {
    throw new TokenError("corrupt token");
  }
}
