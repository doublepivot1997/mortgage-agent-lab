import { NextResponse } from "next/server";
import { handleChat, type ChatRequest } from "../../../src/web/chat-service";
import { getLimiter, liveChatLimits } from "../../../src/web/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // an agent turn with tool calls can take several seconds

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export async function GET() {
  const l = liveChatLimits();
  return NextResponse.json({ enabled: l.enabled, max_messages: l.maxMessagesPerConversation, max_chars: l.maxMessageChars });
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const limits = liveChatLimits();
  let limiter;
  try {
    limiter = getLimiter();
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Live chat isn't configured on this deployment. Replays are available." }, { status: 503 });
  }
  const result = await handleChat(body, { limits, limiter, ip: clientIp(req) });
  if (result.ok) return NextResponse.json(result.view);
  return NextResponse.json(
    { error: result.error },
    { status: result.status, headers: result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined },
  );
}
