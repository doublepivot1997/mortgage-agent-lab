import type { Metadata } from "next";
import { lenders } from "../../src/web/data";
import { liveChatLimits, rateLimitBackend } from "../../src/web/ratelimit";
import { SCENARIOS } from "../../src/web/chat-service";
import { ChatClient, type LenderInfo } from "./ChatClient";

export const metadata: Metadata = { title: "Live chat" };
export const dynamic = "force-dynamic"; // reflects whether live chat is enabled on this deployment

export default function ChatPage() {
  const limits = liveChatLimits();
  const info: LenderInfo[] = lenders().map((c) => ({
    id: c.lender.id,
    name: c.lender.name,
    agentName: c.persona.agent_name,
    customerTerm: c.lender.customer_term,
    blurb:
      c.handoff.live_transfer_available === "always"
        ? "Mortgage lender. Loan officers available 24/7. Efficient tone."
        : "Credit union. Members only, weekdays 9-5 Pacific, stricter compliance, warmer tone.",
    fields: c.qualification.fields.map((f) => ({ id: f.id, label: f.label })),
  }));
  const scenarios = Object.entries(SCENARIOS).map(([id, s]) => ({ id, label: s.label }));

  return (
    <main className="container">
      <h1>Chat with the agent</h1>
      <p className="lead">
        You&apos;re a borrower who just submitted a refinance inquiry. The agent texts first. Try being busy, skeptical, pushy about rates, or
        replying STOP. Nothing leaves this page: no real texts, no real loan officers.
      </p>
      <ChatClient lenders={info} scenarios={scenarios} enabled={limits.enabled && rateLimitBackend() !== "missing"} maxChars={limits.maxMessageChars} />
    </main>
  );
}
