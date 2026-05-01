import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import InputBar from "../components/chat/InputBar";
import MessageList from "../components/chat/MessageList";
import { useAuthQuery, useLogoutMutation } from "../hooks/useAuth";
import {
  useChatHistoryQuery,
  useChatThreadsQuery,
  useSendMessageMutation,
} from "../hooks/useChat";
import type { Message } from "../types";

function ChatPage() {
  const navigate = useNavigate();
  const authQuery = useAuthQuery();
  const logoutMutation = useLogoutMutation();
  const threadsQuery = useChatThreadsQuery();
  const sendMutation = useSendMessageMutation();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const historyQuery = useChatHistoryQuery(selectedThreadId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (authQuery.isError) {
      navigate("/", { replace: true });
    }
  }, [authQuery.isError, navigate]);

  useEffect(() => {
    if (!isDraftMode && !selectedThreadId && threadsQuery.data?.threads.length) {
      setSelectedThreadId(threadsQuery.data.threads[0].id);
    }
  }, [isDraftMode, selectedThreadId, threadsQuery.data]);

  useEffect(() => {
    if (historyQuery.data?.messages) {
      setMessages(historyQuery.data.messages);
    }
  }, [historyQuery.data]);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      navigate("/", { replace: true });
    }
  };

  const handleSend = async (value: string) => {
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: value,
      created_at: new Date().toISOString(),
    };

    const assistantMessageId = `a-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setError("");
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      await sendMutation.mutateAsync({
        message: value,
        threadId: selectedThreadId,
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: msg.content + chunk } : msg,
            ),
          );
        },
      });
      const refreshedThreads = await threadsQuery.refetch();
      if (!selectedThreadId && refreshedThreads.data?.threads.length) {
        setSelectedThreadId(refreshedThreads.data.threads[0].id);
        setIsDraftMode(false);
      }
      if (selectedThreadId) {
        await historyQuery.refetch();
      }
    } catch {
      setError("Failed to stream response from backend.");
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    }
  };

  const heading = useMemo(() => {
    const name = authQuery.data?.name;
    return name ? `Chat - ${name}` : "Chat";
  }, [authQuery.data]);

  const isSending = sendMutation.isPending;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{heading}</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Logout
        </button>
      </header>

      <section className="grid flex-1 grid-cols-[260px_1fr] gap-4">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Conversations</h2>
            <button
              type="button"
              onClick={() => {
                setIsDraftMode(true);
                setSelectedThreadId(null);
                setMessages([]);
                setError("");
              }}
              className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                selectedThreadId === null
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-slate-100 text-slate-700"
              }`}
            >
              New Chat
            </button>
          </div>
          <div className="space-y-2">
            {threadsQuery.data?.threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setIsDraftMode(false);
                  setSelectedThreadId(thread.id);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-left ${
                  selectedThreadId === thread.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <p className="text-sm font-medium">{thread.title}</p>
                {thread.last_message ? (
                  <p className="mt-1 line-clamp-2 text-xs opacity-80">{thread.last_message}</p>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <MessageList messages={messages} />
          <InputBar onSend={handleSend} isSending={isSending} />
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

export default ChatPage;
