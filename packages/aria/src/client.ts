/**
 * ARIA client — Next.js server-side only
 * packages/aria/src/client.ts
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set — ARIA requires a server-side API key.");
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}
