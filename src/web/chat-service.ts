import type Anthropic from "@anthropic-ai/sdk";
import { localClock } from "../agent/lead";
import { AgentSession, type SessionState, type ToolEvent } from "../agent/session";
import { listLenders, loadLenderConfig, type ModelConfig } from "../lib/config";
import { checkMessage, checkStart, type Limiter, type LiveChatLimits } from "./ratelimit";
import { decodeToken, encodeToken, TokenError } from "./token";

/**
 * Framework-free logic behind POST /api/chat, so it can be unit tested with a fake model client.
 */

export const SCENARIOS = {
  live: { label: "Right now", now: null },
  weekday: { label: "Weekday, 11am Pacific / 2pm Eastern", now: "2026-10-21T18:00:00Z" },
  saturday_night: { label: "Saturday, 7:30pm Pacific / 10:30pm Eastern", now: "2026-10-25T02:30:00Z" },
} as const;
export type ScenarioId = keyof typeof SCENARIOS;

export type ChatRequest =
  | { action: "start"; lender: string; scenario?: ScenarioId; first_name?: string }
  | { action: "send"; token: string; message: string };

export interface ChatView {
  token: string;
  lender: string;
  status: SessionState["status"];
  turns: { role: "agent" | "borrower"; text: string; events?: ToolEvent[] }[];
  lead: SessionState["lead"];
  handoff: SessionState["handoff"];
  callback: SessionState["callback"];
  end: SessionState["end"];
  local_time: string;
  messages_left: number;
}

export type ChatResult = { ok: true; view: ChatView } | { ok: false; status: number; error: string; retryAfterSec?: number };

export interface ChatDeps {
  limits: LiveChatLimits;
  limiter: Limiter;
  ip: string;
  client?: Anthropic;
  models?: ModelConfig;
  now?: () => Date;
}

function view(s: AgentSession, limits: LiveChatLimits): ChatView {
  const state = s.toState();
  const borrowerTurns = state.transcript.filter((t) => t.role === "borrower").length;
  return {
    token: encodeToken(state),
    lender: state.lender_id,
    status: state.status,
    turns: state.transcript.map((t) => ({ role: t.role, text: t.text, ...(t.events?.length ? { events: t.events } : {}) })),
    lead: state.lead,
    handoff: state.handoff,
    callback: state.callback,
    end: state.end,
    local_time: localClock(s.now, s.cfg.lender.timezone).label,
    messages_left: Math.max(0, limits.maxMessagesPerConversation - borrowerTurns),
  };
}

const cleanName = (n: unknown) => (typeof n === "string" ? n.replace(/[^\p{L}' -]/gu, "").trim().slice(0, 24) : "") || "Alex";

export async function handleChat(req: ChatRequest, deps: ChatDeps): Promise<ChatResult> {
  const { limits } = deps;
  if (!limits.enabled) return { ok: false, status: 503, error: "Live chat is turned off for this demo right now. Replays are available." };

  try {
    if (req.action === "start") {
      if (!listLenders().includes(req.lender)) return { ok: false, status: 400, error: "Unknown lender." };
      const scenario = SCENARIOS[req.scenario ?? "live"] ? (req.scenario ?? "live") : "live";
      const gate = await checkStart(deps.limiter, limits, deps.ip);
      if (!gate.ok) return { ok: false, status: 429, error: gate.reason, retryAfterSec: gate.retryAfterSec };

      const fixed = SCENARIOS[scenario].now;
      const session = new AgentSession({
        lender: loadLenderConfig(req.lender),
        intake: { first_name: cleanName(req.first_name), last_name: "Visitor", form_answers: { "What are you looking to do?": "Refinance" } },
        now: fixed ? new Date(fixed) : (deps.now?.() ?? new Date()),
        models: deps.models,
        client: deps.client,
      });
      await session.start();
      return { ok: true, view: view(session, limits) };
    }

    if (req.action === "send") {
      const message = typeof req.message === "string" ? req.message.trim() : "";
      if (!message) return { ok: false, status: 400, error: "Type a message first." };
      if (message.length > limits.maxMessageChars) return { ok: false, status: 400, error: `Please keep messages under ${limits.maxMessageChars} characters.` };

      const state = decodeToken<SessionState>(req.token);
      const session = AgentSession.fromState(state, { models: deps.models, client: deps.client });
      if (session.status !== "active") return { ok: false, status: 409, error: "This conversation has ended. Start a new one." };
      const borrowerTurns = state.transcript.filter((t) => t.role === "borrower").length;
      if (borrowerTurns >= limits.maxMessagesPerConversation) return { ok: false, status: 429, error: "This demo conversation hit its message limit. Start a new one." };

      const gate = await checkMessage(deps.limiter, limits, deps.ip);
      if (!gate.ok) return { ok: false, status: 429, error: gate.reason, retryAfterSec: gate.retryAfterSec };

      await session.send(message);
      return { ok: true, view: view(session, limits) };
    }
    return { ok: false, status: 400, error: "Unknown action." };
  } catch (e) {
    if (e instanceof TokenError) return { ok: false, status: 400, error: "This conversation can't be resumed. Start a new one." };
    console.error("chat error", e);
    return { ok: false, status: 502, error: "The agent couldn't respond just now. Please try again." };
  }
}
