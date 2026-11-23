import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, executeTool, summarizeResult } from "@/lib/claude-tools";
import { buildSystemPrompt } from "@/lib/claude-system-prompt";
import { appendMessage, type ChatModel } from "@/actions/chat";

export const dynamic = "force-dynamic";
// 300s = Vercel Pro max. On Hobby the cap is 60s and this is ignored.
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any;

const MODEL_MAX_TOKENS: Record<ChatModel, number> = {
  "claude-sonnet-4-5": 16384,
  "claude-opus-4-7": 16384,
};

const ANTHROPIC_MODEL_ID: Record<ChatModel, string> = {
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-opus-4-7": "claude-opus-4-7",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  const body = (await req.json()) as {
    conversationId: string;
    model: ChatModel;
    messages: { role: "user" | "assistant"; content: ContentBlock[] }[];
  };

  const { conversationId, model, messages } = body;

  if (!conversationId || !messages || messages.length === 0) {
    return new Response("Missing conversationId or messages", { status: 400 });
  }

  // Persist the latest user message (last entry in `messages` should be the new user turn)
  const latestUserMsg = messages[messages.length - 1];
  if (latestUserMsg.role === "user") {
    await appendMessage({
      conversationId,
      role: "user",
      content: latestUserMsg.content,
    });
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = await buildSystemPrompt();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Conversation history we mutate as we loop tool calls
      const apiMessages: { role: "user" | "assistant"; content: ContentBlock[] }[] = [...messages];

      let totalInput = 0, totalOutput = 0;
      const toolCallSummary: { name: string; input: unknown }[] = [];

      try {
        // Tool-use loop. Each iteration: call model → if tool_use stop reason, execute tools, loop.
        // Cap iterations so we can't infinite-loop.
        for (let iteration = 0; iteration < 10; iteration++) {
          const response = await client.messages.create({
            model: ANTHROPIC_MODEL_ID[model],
            max_tokens: MODEL_MAX_TOKENS[model],
            system: systemPrompt,
            tools: TOOL_DEFINITIONS,
            messages: apiMessages,
          });

          totalInput += response.usage.input_tokens;
          totalOutput += response.usage.output_tokens;

          // Stream every text block to the client so the UI can render incrementally.
          // (Not true token-by-token streaming — we wait for the full message then push;
          //  upgrading to .stream() later would be a quick refactor.)
          for (const block of response.content) {
            if (block.type === "text" && block.text) {
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              send({ type: "tool_use", name: block.name, input: block.input });
              toolCallSummary.push({ name: block.name, input: block.input });
            }
          }

          // If model is done thinking, exit loop
          if (response.stop_reason !== "tool_use") {
            // Persist final assistant message
            await appendMessage({
              conversationId,
              role: "assistant",
              content: response.content,
              toolCalls: toolCallSummary.length ? toolCallSummary : undefined,
              inputTokens: totalInput,
              outputTokens: totalOutput,
            });
            send({ type: "done", inputTokens: totalInput, outputTokens: totalOutput });
            break;
          }

          // Otherwise, execute tool_use blocks IN PARALLEL and append results.
          // Sequential awaits used to blow the 60s timeout when Claude asked for
          // 5+ tools at once (e.g. routine-audit prompts).
          apiMessages.push({ role: "assistant", content: response.content });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolBlocks: any[] = response.content.filter((b) => b.type === "tool_use");

          const settled = await Promise.all(
            toolBlocks.map(async (block) => {
              const result = await executeTool(block.name, block.input as Record<string, unknown>);
              const ok = !(result as { error?: string })?.error;
              return { block, result, ok };
            })
          );

          const toolResults: ContentBlock[] = [];
          for (const { block, result, ok } of settled) {
            send({
              type: "tool_result",
              name: block.name,
              ok,
              summary: ok ? summarizeResult(block.name, result) : (result as { error?: string }).error ?? "error",
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result).slice(0, 50000),
            });
          }
          apiMessages.push({ role: "user", content: toolResults });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
