import type Anthropic from "@anthropic-ai/sdk";
import { loadLenderConfig, type LenderConfig } from "../src/lib/config";

export function harborline(): LenderConfig {
  return loadLenderConfig("harborline");
}

/** Deep copy so a test can tweak config without affecting others. */
export function tweak(cfg: LenderConfig, edit: (c: LenderConfig) => void): LenderConfig {
  const copy = structuredClone(cfg);
  edit(copy);
  return copy;
}

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> };

/** A stand-in for the Anthropic client that replays scripted model turns. No network. */
export function fakeClient(turns: Block[][]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  let id = 0;
  const client = {
    beta: {
      messages: {
        create: async (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
          calls.push(structuredClone(params));
          const blocks = turns.shift();
          if (!blocks) throw new Error("fake client ran out of scripted turns");
          const content = blocks.map((b) => (b.type === "tool_use" ? { ...b, id: `tu_${++id}` } : b));
          return {
            content,
            stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
            usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 500 },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}
