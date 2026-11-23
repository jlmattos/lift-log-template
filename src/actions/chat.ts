"use server";

import { supabase } from "@/db";
import { revalidatePath } from "next/cache";

export type ChatModel = "claude-sonnet-4-5" | "claude-opus-4-7";

export type Conversation = {
  id: string;
  title: string | null;
  model: ChatModel;
  created_at: string;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any;

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  tool_calls: { name: string; input: unknown }[] | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export async function listConversations(limit = 30): Promise<Conversation[]> {
  const { data } = await supabase
    .from("chat_conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Conversation[];
}

export async function getConversation(id: string): Promise<{
  conversation: Conversation | null;
  messages: ChatMessage[];
}> {
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    supabase.from("chat_conversations").select("*").eq("id", id).maybeSingle(),
    supabase.from("chat_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }),
  ]);
  return {
    conversation: (conv as Conversation) ?? null,
    messages: (msgs ?? []) as ChatMessage[],
  };
}

export async function createConversation(model: ChatModel): Promise<Conversation> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ model })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/chat");
  return data as Conversation;
}

export async function setConversationTitle(id: string, title: string) {
  await supabase.from("chat_conversations").update({ title: title.trim().slice(0, 80) }).eq("id", id);
  revalidatePath("/chat");
}

export async function deleteConversation(id: string) {
  await supabase.from("chat_conversations").delete().eq("id", id);
  revalidatePath("/chat");
}

export async function appendMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  toolCalls?: { name: string; input: unknown }[];
  inputTokens?: number;
  outputTokens?: number;
}) {
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
    tool_calls: input.toolCalls ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
  });
  if (error) throw new Error(error.message);

  // Bump updated_at on parent conversation
  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);
}
