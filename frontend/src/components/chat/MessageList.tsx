import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useEffect, useRef } from "react";

import type { Message } from "../../types";
import { apiClient } from "../../lib/api";


type MessageListProps = {
  messages: Message[];
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
};

function MessageList({ messages, hasMoreHistory = false, loadingOlder = false, onLoadOlder }: MessageListProps) {
  const baseUrl = apiClient.defaults.baseURL ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreScrollRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (!loadingOlder && restoreScrollRef.current) {
      const { prevHeight, prevTop } = restoreScrollRef.current;
      container.scrollTop = container.scrollHeight - prevHeight + prevTop;
      restoreScrollRef.current = null;
      prevMessageCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessageCountRef.current && !loadingOlder) {
      container.scrollTop = container.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [loadingOlder, messages]);

  const resolveUrl = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `${baseUrl}${url}`;
  };

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (container.scrollTop > 80) {
      return;
    }
    if (!hasMoreHistory || loadingOlder || !onLoadOlder) {
      return;
    }

    restoreScrollRef.current = {
      prevHeight: container.scrollHeight,
      prevTop: container.scrollTop,
    };
    onLoadOlder();
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex h-full flex-col gap-5 overflow-y-auto pr-3 pt-2">
      {messages.map((msg) => (
        <article
          key={msg.id}
          className={
            msg.role === "user"
              ? "ml-auto max-w-[85%] rounded-2xl border border-[#1f318a] bg-[#3557e6] px-5 py-4 text-white shadow-md"
              : "mr-auto max-w-[85%] rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 shadow-md"
          }
        >
          <div className="flex items-center gap-2 mb-2.5">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">
              {msg.role === "user" ? "👤 You" : "🤖 Assistant"}
            </p>
          </div>
          <div className={`prose prose-base max-w-none ${msg.role === "user" ? "text-white prose-invert" : "text-slate-900"} prose-p:my-2 prose-pre:overflow-x-auto prose-code:rounded prose-code:px-2 prose-code:py-1 ${msg.role === "user" ? "prose-code:bg-[#2a42b8]" : "prose-code:bg-slate-200"}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {msg.content}
            </ReactMarkdown>
          </div>

          {msg.attachments?.length ? (
            <div className={`mt-3 space-y-2 rounded-lg border p-3 ${
              msg.role === "user"
                ? "border-[#7fa8ff] bg-[#2a42b8]"
                : "border-slate-200 bg-white"
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Attachments</p>
              {msg.attachments.map((attachment) => {
                const resolvedUrl = resolveUrl(attachment.url);
                const isImage = attachment.mime_type.startsWith("image/");
                const isVideo = attachment.mime_type.startsWith("video/");

                return (
                  <div key={`${attachment.url}-${attachment.file_name}`} className="space-y-2">
                    <a
                      href={resolvedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`block text-xs font-medium underline ${
                        msg.role === "user" ? "text-blue-100 hover:text-blue-200" : "text-blue-600 hover:text-blue-700"
                      }`}
                    >
                      📎 {attachment.file_name} ({Math.max(1, Math.round(attachment.size_bytes / 1024))} KB)
                    </a>
                    {isImage ? (
                      <img
                        src={resolvedUrl}
                        alt={attachment.file_name}
                        className="max-h-64 w-auto rounded-lg border border-slate-200 shadow-sm"
                      />
                    ) : null}
                    {isVideo ? (
                      <video
                        controls
                        src={resolvedUrl}
                        className="max-h-64 w-full rounded-lg border border-slate-200 shadow-sm"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      ))}
      {hasMoreHistory && !loadingOlder ? (
        <p className="text-center text-xs text-slate-400">or scroll up to load more</p>
      ) : null}
    </div>
  );
}

export default MessageList;
