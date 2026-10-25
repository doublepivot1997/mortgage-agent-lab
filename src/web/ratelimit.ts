import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Spend protection for the public live chat. Uses Upstash Redis when configured (shared across
 * serverless instances); otherwise an in-memory store, which is fine for local dev only.
 */

export interface LiveChatLimits {
  enabled: boolean;
  /** New conversations per visitor IP per day. */
  perIpDaily: number;
  /** Messages per visitor IP per hour. */
  perIpMessagesHourly: number;
  /** New conversations per day across all visitors: the hard spend cap. */
  globalDaily: number;
  /** Borrower messages allowed in one conversation. */
  maxMessagesPerConversation: number;
  /** Characters allowed in one message. */
  maxMessageChars: number;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function liveChatLimits(env: Record<string, string | undefined> = process.env): LiveChatLimits {
  return {
    enabled: env.LIVE_CHAT_ENABLED !== "false" && !!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY !== "paste-your-key-here",
    perIpDaily: num(env.LIVE_CHAT_PER_IP_DAILY, 5),
    perIpMessagesHourly: num(env.LIVE_CHAT_PER_IP_MESSAGES_HOURLY, 60),
    globalDaily: num(env.LIVE_CHAT_DAILY_CAP, 60),
    maxMessagesPerConversation: num(env.LIVE_CHAT_MAX_MESSAGES, 16),
    maxMessageChars: num(env.LIVE_CHAT_MAX_CHARS, 500),
  };
}

export interface LimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

export interface Limiter {
  hit(bucket: string, key: string, max: number, windowSec: number): Promise<LimitResult>;
  readonly kind: "upstash" | "memory";
}

/** Fixed-window counter in process memory. Resets on restart; not shared across instances. */
export class MemoryLimiter implements Limiter {
  readonly kind = "memory" as const;
  private store = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly clock: () => number = Date.now) {}

  async hit(bucket: string, key: string, max: number, windowSec: number): Promise<LimitResult> {
    const now = this.clock();
    const id = `${bucket}:${key}`;
    let entry = this.store.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSec * 1000 };
      this.store.set(id, entry);
    }
    if (entry.count >= max) return { ok: false, remaining: 0, resetAt: entry.resetAt };
    entry.count += 1;
    return { ok: true, remaining: max - entry.count, resetAt: entry.resetAt };
  }
}

class UpstashLimiter implements Limiter {
  readonly kind = "upstash" as const;
  private redis = Redis.fromEnv();
  private cache = new Map<string, Ratelimit>();

  async hit(bucket: string, key: string, max: number, windowSec: number): Promise<LimitResult> {
    const id = `${bucket}:${max}:${windowSec}`;
    let rl = this.cache.get(id);
    if (!rl) {
      rl = new Ratelimit({ redis: this.redis, limiter: Ratelimit.fixedWindow(max, `${windowSec} s`), prefix: `mal:${bucket}` });
      this.cache.set(id, rl);
    }
    const r = await rl.limit(key);
    return { ok: r.success, remaining: r.remaining, resetAt: r.reset };
  }
}

let limiter: Limiter | null = null;
export function getLimiter(): Limiter {
  if (!limiter) {
    const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!hasUpstash && process.env.NODE_ENV === "production" && process.env.LIVE_CHAT_ALLOW_MEMORY_LIMITER !== "true") {
      throw new Error("Live chat in production needs Upstash Redis (UPSTASH_REDIS_REST_URL/TOKEN) for rate limiting.");
    }
    limiter = hasUpstash ? new UpstashLimiter() : new MemoryLimiter();
  }
  return limiter;
}

const DAY = 86_400;
const HOUR = 3_600;

export type LimitCheck = { ok: true } | { ok: false; reason: string; retryAfterSec: number };

/** Check limits for starting a conversation (consumes one unit from each bucket). */
export async function checkStart(l: Limiter, limits: LiveChatLimits, ip: string, now = Date.now()): Promise<LimitCheck> {
  const perIp = await l.hit("start-ip", ip, limits.perIpDaily, DAY);
  if (!perIp.ok) return { ok: false, reason: `You've started ${limits.perIpDaily} live chats today. Replays are unlimited.`, retryAfterSec: Math.ceil((perIp.resetAt - now) / 1000) };
  const global = await l.hit("start-global", "all", limits.globalDaily, DAY);
  if (!global.ok) return { ok: false, reason: "Today's live-chat budget for this demo is used up. Replays are unlimited.", retryAfterSec: Math.ceil((global.resetAt - now) / 1000) };
  return { ok: true };
}

export async function checkMessage(l: Limiter, limits: LiveChatLimits, ip: string, now = Date.now()): Promise<LimitCheck> {
  const r = await l.hit("msg-ip", ip, limits.perIpMessagesHourly, HOUR);
  if (!r.ok) return { ok: false, reason: "You're sending messages quickly. Try again in a bit.", retryAfterSec: Math.ceil((r.resetAt - now) / 1000) };
  return { ok: true };
}
