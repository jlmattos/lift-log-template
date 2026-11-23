import { redirect } from "next/navigation";
import { listConversations, getConversation, type Conversation, type ChatMessage } from "@/actions/chat";
import { ChatView } from "@/components/chat-view";
import { BackHeader } from "@/components/back-header";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const params = await searchParams;
  const conversations = await listConversations(30);

  // Default to the most-recent conversation. ?new=1 explicitly starts fresh.
  let activeId: string | null = params.c ?? null;
  if (!activeId && !params.new && conversations.length > 0) {
    redirect(`/chat?c=${conversations[0].id}`);
  }

  // Server-render the chosen conversation's messages — this guarantees
  // the user sees the saved content instantly with zero client-side
  // fetch dance. Streaming for NEW questions still happens client-side.
  let initialMessages: ChatMessage[] = [];
  let activeConversation: Conversation | null = null;
  if (activeId) {
    const { conversation, messages } = await getConversation(activeId);
    activeConversation = conversation;
    initialMessages = messages;
    if (!conversation) activeId = null;
  }

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/more"
        title="Ask Claude"
        subtitle={activeConversation?.title ?? "AI fitness advisor with access to your data"}
        truncateSubtitle
        className="mb-3"
      />

      <ChatView
        initialConversations={conversations}
        initialActiveId={activeId}
        initialMessages={initialMessages}
        initialModel={activeConversation?.model ?? "claude-sonnet-4-5"}
      />
    </div>
  );
}
