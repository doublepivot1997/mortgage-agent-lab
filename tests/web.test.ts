import { describe, expect, it } from "vitest";
import { AgentSession, type SessionState } from "../src/agent/session";
import { handleChat, type ChatDeps } from "../src/web/chat-service";
import { checkMessage, checkStart, liveChatLimits, MemoryLimiter } from "../src/web/ratelimit";
import { decodeToken, encodeToken, TokenError } from "../src/web/token";
import { runNotes, showcaseConversationParams, showcaseRun } from "../src/web/data";
import { fakeClient, harborline } from "./helpers";

const KEY = "k".repeat(40);
const OPENER = [{ type: "text" as const, text: "Hi Alex, this is Riley, an automated assistant with Harborline Home Loans. Reply STOP to opt out." }];

describe("signed session tokens", () => {
  it("round-trips and compresses", () => {
    const payload = { a: 1, text: "hello ".repeat(500) };
    const t = encodeToken(payload, KEY);
    expect(decodeToken(t, KEY)).toEqual(payload);
    expect(t.length).toBeLessThan(JSON.stringify(payload).length / 5);
  });

  it("rejects tampering, wrong keys, and garbage", () => {
    const t = encodeToken({ status: "active" }, KEY);
    const [body, sig] = t.split(".");
    const forged = encodeToken({ status: "transferred" }, KEY).split(".")[0];
    expect(() => decodeToken(`${forged}.${sig}`, KEY)).toThrow(TokenError);
    expect(() => decodeToken(t, "x".repeat(40))).toThrow(TokenError);
    expect(() => decodeToken(`${body}`, KEY)).toThrow(TokenError);
    expect(() => decodeToken("", KEY)).toThrow(TokenError);
  });
});

describe("session state", () => {
  it("resumes a session exactly, including model history", async () => {
    const { client, calls } = fakeClient([OPENER, [{ type: "text", text: "Great. Lower your rate or take cash out?" }]]);
    const s = new AgentSession({ lender: harborline(), intake: { first_name: "Alex", last_name: "V", form_answers: {} }, now: new Date("2026-10-21T18:00:00Z"), client });
    await s.start();
    const state = JSON.parse(JSON.stringify(s.toState())) as SessionState;
    const resumed = AgentSession.fromState(state, { client });
    await resumed.send("yes");
    expect(resumed.transcript.map((t) => t.role)).toEqual(["agent", "borrower", "agent"]);
    // The second API call carried the first call's assistant turn verbatim.
    expect(calls[1]!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(resumed.now.toISOString()).toBe("2026-10-21T18:00:00.000Z");
  });
});

describe("rate limits", () => {
  const limits = { ...liveChatLimits({ ANTHROPIC_API_KEY: "sk-test" }), perIpDaily: 2, globalDaily: 3, perIpMessagesHourly: 2 };

  it("caps conversations per IP and globally, and resets after the window", async () => {
    let now = 0;
    const l = new MemoryLimiter(() => now);
    expect((await checkStart(l, limits, "a", now)).ok).toBe(true);
    expect((await checkStart(l, limits, "a", now)).ok).toBe(true);
    expect(await checkStart(l, limits, "a", now)).toMatchObject({ ok: false, reason: expect.stringMatching(/live chats today/) });
    expect((await checkStart(l, limits, "b", now)).ok).toBe(true);
    expect(await checkStart(l, limits, "c", now)).toMatchObject({ ok: false, reason: expect.stringMatching(/budget/) });
    now += 86_400_001;
    expect((await checkStart(l, limits, "a", now)).ok).toBe(true);
  });

  it("caps message rate per IP", async () => {
    const l = new MemoryLimiter(() => 0);
    await checkMessage(l, limits, "a", 0);
    await checkMessage(l, limits, "a", 0);
    expect((await checkMessage(l, limits, "a", 0)).ok).toBe(false);
  });

  it("is off without an API key or when switched off", () => {
    expect(liveChatLimits({}).enabled).toBe(false);
    expect(liveChatLimits({ ANTHROPIC_API_KEY: "paste-your-key-here" }).enabled).toBe(false);
    expect(liveChatLimits({ ANTHROPIC_API_KEY: "sk-x", LIVE_CHAT_ENABLED: "false" }).enabled).toBe(false);
    expect(liveChatLimits({ ANTHROPIC_API_KEY: "sk-x", LIVE_CHAT_DAILY_CAP: "10" }).globalDaily).toBe(10);
  });
});

describe("chat API logic", () => {
  process.env.SESSION_SECRET = KEY;
  const deps = (client: ChatDeps["client"], over: Partial<ChatDeps["limits"]> = {}): ChatDeps => ({
    limits: { ...liveChatLimits({ ANTHROPIC_API_KEY: "sk-test" }), ...over },
    limiter: new MemoryLimiter(),
    ip: "1.2.3.4",
    client,
  });

  it("starts, continues, and returns a signed token plus the view", async () => {
    const { client } = fakeClient([OPENER, [{ type: "text", text: "Lower your rate or cash out?" }]]);
    const d = deps(client);
    const start = await handleChat({ action: "start", lender: "harborline", scenario: "weekday", first_name: "Sam<script>" }, d);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.view.turns).toHaveLength(1);
    expect(start.view.local_time).toContain("Wednesday");
    const next = await handleChat({ action: "send", token: start.view.token, message: "yes" }, d);
    expect(next.ok && next.view.turns.map((t) => t.role)).toEqual(["agent", "borrower", "agent"]);
    const state = decodeToken<SessionState>(start.view.token);
    expect(state.intake.first_name).toBe("Samscript"); // name sanitized
  });

  it("rejects bad input without calling the model", async () => {
    const { client, calls } = fakeClient([OPENER]);
    const d = deps(client, { maxMessageChars: 10, maxMessagesPerConversation: 0 });
    expect(await handleChat({ action: "start", lender: "nope" }, d)).toMatchObject({ ok: false, status: 400 });
    const start = await handleChat({ action: "start", lender: "harborline" }, d);
    if (!start.ok) throw new Error("start failed");
    expect(await handleChat({ action: "send", token: start.view.token, message: "x".repeat(11) }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await handleChat({ action: "send", token: start.view.token, message: "hi" }, d)).toMatchObject({ ok: false, status: 429 });
    expect(await handleChat({ action: "send", token: "forged.token", message: "hi" }, deps(client))).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(1); // only the opener
  });

  it("returns 503 when live chat is disabled", async () => {
    const { client } = fakeClient([]);
    expect(await handleChat({ action: "start", lender: "harborline" }, deps(client, { enabled: false }))).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses to continue an ended conversation", async () => {
    const { client } = fakeClient([OPENER]);
    const d = deps(client);
    const start = await handleChat({ action: "start", lender: "harborline" }, d);
    if (!start.ok) throw new Error("start failed");
    const stopped = await handleChat({ action: "send", token: start.view.token, message: "STOP" }, d);
    expect(stopped.ok && stopped.view.status).toBe("opted_out");
    if (!stopped.ok) return;
    expect(await handleChat({ action: "send", token: stopped.view.token, message: "hello" }, d)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("site data", () => {
  it("finds a full showcase run per lender and its transcripts", () => {
    expect(showcaseRun("harborline")?.overall.conversations).toBe(30);
    expect(showcaseRun("bayview")?.overall.conversations).toBe(30);
    expect(showcaseConversationParams()).toHaveLength(60);
  });
  it("reads run notes from the findings log", () => {
    expect(Object.values(runNotes())).toContain("first full run");
  });
});

describe("deploy config", () => {
  it("accepts Upstash credentials under either naming scheme", async () => {
    const { upstashCredentials } = await import("../src/web/ratelimit");
    expect(upstashCredentials({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(upstashCredentials({ KV_REST_API_URL: "u2", KV_REST_API_TOKEN: "t2" })).toEqual({ url: "u2", token: "t2" });
    expect(upstashCredentials({ KV_REST_API_URL: "u2" })).toBeNull();
  });
});
