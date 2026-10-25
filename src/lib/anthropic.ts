import Anthropic from "@anthropic-ai/sdk";

/** Opt-in to server-side fallback: if the model declines, Anthropic re-runs on its recommended model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let shared: Anthropic | null = null;

export function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "paste-your-key-here") {
    throw new Error("ANTHROPIC_API_KEY is not set. Paste your key into .env.local (see .env.example).");
  }
  // Org-level keys (not scoped to a workspace) must name the workspace on every request.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  shared ??= new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});
  return shared;
}
