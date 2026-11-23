import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/claude-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP server (Streamable HTTP, stateless) exposing the fitness advisor's
 * read-only tool registry to any MCP client — built for claude.ai custom
 * connectors so every Claude session (chat, project, cowork, mobile) can
 * query training data natively.
 *
 * Auth: the URL path segment is the credential — an unguessable secret
 * checked against MCP_SECRET (Vercel env var, fail-closed). Treat the full
 * URL like a password. No OAuth: this is a personal, read-only feed.
 *
 * Protocol: JSON-RPC 2.0 over POST. Handles initialize, ping, tools/list,
 * tools/call, and notifications (202). GET/DELETE return 405 — no SSE
 * stream, no sessions; every request is self-contained.
 */

const PROTOCOL_VERSION = "2025-06-18";
// Versions we can faithfully serve; echo the client's if we know it.
const KNOWN_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

function authorized(secret: string): boolean {
  const expected = process.env.MCP_SECRET;
  if (!expected) return false; // fail closed
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: number | string | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number | string | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleOne(msg: JsonRpcRequest): Promise<object | null> {
  const id = msg.id ?? null;

  // Notifications (no id) get no response body.
  if (msg.id === undefined || msg.method?.startsWith("notifications/")) {
    return null;
  }

  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string) ?? PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: KNOWN_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lift-log", version: "1.0.0" },
        instructions:
          "Read-only access to the owner's lift-log training data: workouts, sets, " +
          "strength analytics, cardio, routines, injuries, and PRs. All tools " +
          "are queries — nothing here can modify data.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
        })),
      });

    case "tools/call": {
      const name = msg.params?.name as string;
      const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
      if (!TOOL_DEFINITIONS.some((t) => t.name === name)) {
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const result = await executeTool(name, args);
        // executeTool never throws — failures come back as an {error} envelope.
        // Surface those with isError so MCP clients see a failed call, not a
        // success whose text happens to contain error JSON.
        const failed =
          result !== null && typeof result === "object" && "error" in result;
        if (failed) {
          return rpcResult(id, {
            content: [{ type: "text", text: `Error: ${(result as { error: string }).error}` }],
            isError: true,
          });
        }
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ secret: string }> }
) {
  const { secret } = await ctx.params;
  if (!authorized(secret)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleOne(m as JsonRpcRequest))))
      .filter((r): r is object => r !== null);
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses);
  }

  const response = await handleOne(body as JsonRpcRequest);
  if (response === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}

// Stateless server: no SSE stream to resume, no session to delete.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
