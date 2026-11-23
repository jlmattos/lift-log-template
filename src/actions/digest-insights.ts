"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getUserContext } from "@/actions/user-context";

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT =
  "You are a sharp, no-nonsense strength & conditioning coach reviewing a " +
  "client's weekly training log. You are concise, specific, and prioritize " +
  "actionable guidance over praise. You reason from the actual numbers in the " +
  "data and never invent sessions or lifts that aren't there.";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Generate proactive coaching insights from a week's digest. On-demand (button
 * triggered) so the digest page stays fast and we don't burn tokens on every
 * load. Returns markdown to render alongside the passive digest.
 */
export async function getDigestInsights(
  digestMarkdown: string,
): Promise<{ text: string; generatedAt: string }> {
  const ctx = await getUserContext();
  const ctxParts = [ctx?.goals, ctx?.training_style, ctx?.notes].filter(Boolean);
  const ctxStr = ctxParts.length > 0 ? ctxParts.join("\n") : null;

  const prompt = [
    "Here is my workout digest for the week. Give me PROACTIVE coaching insights — ",
    "not a restatement of the numbers. Be specific and actionable.",
    "",
    "Cover, in this order, only where the data supports it:",
    "1. **What went well** — 1–2 concrete wins worth reinforcing.",
    "2. **Watch-outs** — imbalances, fatigue/symptom risks, lifts trending down, or skipped muscle groups.",
    "3. **Do next week** — 2–3 specific, prioritized actions (exercises, load changes, recovery).",
    "",
    "Keep it tight: short markdown sections with bullet points, no preamble, no sign-off. ",
    "If the week was light or empty, say so briefly and suggest a restart plan.",
    ctxStr ? `\n\nMy context (injuries, goals, training style):\n${ctxStr}` : "",
    "\n\n--- DIGEST ---\n",
    digestMarkdown,
  ].join("\n");

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  return { text, generatedAt: new Date().toISOString() };
}
