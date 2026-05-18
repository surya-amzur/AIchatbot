import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useEffect, useRef, useState, useCallback } from "react";

import type { Message } from "../../types";
import { apiClient } from "../../lib/api";

type MessageListProps = {
  messages: Message[];
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onRefreshMessage?: (messageId: string) => void;
};

// CSS for animations
const AnimationStyles = `
  @keyframes shimmer {
    0% {
      background-position: -1000px 0;
    }
    100% {
      background-position: 1000px 0;
    }
  }

  @keyframes pulse-dot {
    0%, 60%, 100% {
      opacity: 0.3;
    }
    30% {
      opacity: 1;
    }
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .skeleton-shimmer {
    animation: shimmer 2s infinite;
    background: linear-gradient(
      90deg,
      #2a2a3e 0%,
      #3a3a4e 50%,
      #2a2a3e 100%
    );
    background-size: 1000px 100%;
  }

  .typing-dot {
    animation: pulse-dot 1.4s infinite;
  }

  .typing-dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  .message-enter {
    animation: fade-in 0.2s ease-out;
  }
`;

function SkeletonLoader() {
  return (
    <div className="mr-auto max-w-[85%] space-y-2">
      <div className="skeleton-shimmer h-4 w-3/4 rounded" />
      <div className="skeleton-shimmer h-4 w-full rounded" />
      <div className="skeleton-shimmer h-4 w-1/2 rounded" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-1">
      <span className="typing-dot inline-block h-2 w-2 rounded-full bg-slate-400" />
      <span className="typing-dot inline-block h-2 w-2 rounded-full bg-slate-400" />
      <span className="typing-dot inline-block h-2 w-2 rounded-full bg-slate-400" />
    </div>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-green-100 text-green-800 border-green-300",
    medium: "bg-amber-100 text-amber-800 border-amber-300",
    low: "bg-red-100 text-red-800 border-red-300",
  };

  const labels = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return (
    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full border ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

function MessageList({ 
  messages, 
  hasMoreHistory = false, 
  loadingOlder = false, 
  onLoadOlder,
  onRefreshMessage 
}: MessageListProps) {
  const baseUrl = apiClient.defaults.baseURL ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoreScrollRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const prevMessageCountRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollTopRef = useRef(0);

  // Restore scroll position after loading older messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

  // Handle scroll to show "Jump to Latest" button
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    scrollTopRef.current = container.scrollTop;
    
    // Show "Jump to Latest" if scrolled up more than 400px from bottom
    const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 400;
    setShowJumpToLatest(isScrolledUp);

    // Load older messages when at top
    if (container.scrollTop < 80) {
      if (!hasMoreHistory || loadingOlder || !onLoadOlder) return;

      restoreScrollRef.current = {
        prevHeight: container.scrollHeight,
        prevTop: container.scrollTop,
      };
      onLoadOlder();
    }
  }, [hasMoreHistory, loadingOlder, onLoadOlder]);

  const jumpToLatest = () => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  };

  const resolveUrl = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `${baseUrl}${url}`;
  };

  return (
    <>
      <style>{AnimationStyles}</style>
      <div 
        ref={containerRef} 
        onScroll={handleScroll} 
        className="flex h-full flex-col gap-3 overflow-y-scroll pr-1 pt-2 scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-transparent hover:scrollbar-thumb-slate-400"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {/* Loading indicator at top */}
        {loadingOlder && (
          <div className="flex justify-center py-4">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading previous messages...
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, index) => (
          <article
            key={msg.id}
            className={`message-enter ${
              msg.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg border border-[#1f318a] bg-gradient-to-r from-[#2a42b8] to-[#3557e6] px-3 py-2 text-white shadow-sm"
                : "mr-auto max-w-[85%] rounded-lg border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-slate-100 shadow-sm"
            }`}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                {msg.role === "user" ? "👤 You" : "🤖 Assistant"}
              </p>
              {msg.confidence && msg.role === "assistant" && (
                <ConfidenceBadge level={msg.confidence} />
              )}
            </div>

            {/* Warning banner for differing responses */}
            {msg.role === "assistant" && index > 0 && (
              (() => {
                // Check if same question was asked before with different answer
                const currentContent = msg.content;
                const prevSameRoleMessages = messages
                  .slice(Math.max(0, index - 6), index) // Look back up to 6 messages
                  .filter((m) => m.role === "assistant");
                
                if (prevSameRoleMessages.length > 0 && prevSameRoleMessages[0].content !== currentContent) {
                  return (
                    <div className="mb-2 rounded border-l-2 border-yellow-500 bg-yellow-50 px-2 py-1 flex items-center gap-1.5">
                      <span className="text-yellow-600 text-xs">⚠️</span>
                      <p className="text-[10px] text-yellow-800 font-medium leading-tight">
                        Answer differs from previous response for similar query
                      </p>
                    </div>
                  );
                }
                return null;
              })()
            )}

            {/* Content or Loading State */}
            {msg.isLoading ? (
              <div className="space-y-2">
                <TypingIndicator />
              </div>
            ) : (
              <div className={`prose prose-sm max-w-none ${
                msg.role === "user" 
                  ? "text-white prose-invert" 
                  : "text-slate-100"
              } prose-p:my-1 prose-pre:overflow-x-auto prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 ${
                msg.role === "user" 
                  ? "prose-code:bg-[#2a42b8]" 
                  : "prose-code:bg-[#2a2a3e]"
              }`}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Reasoning display (for AI agents) */}
            {msg.reasoning && msg.role === "assistant" && (
              <details className="mt-3 text-xs opacity-75 cursor-pointer">
                <summary className="font-semibold mb-2">💭 Agent Reasoning</summary>
                <div className="ml-2 mt-2 p-2 bg-[#0a0a1a] rounded border border-[#3a3a4e] max-h-40 overflow-y-auto font-mono text-[11px] leading-relaxed">
                  {msg.reasoning}
                </div>
              </details>
            )}

            {/* Attachments */}
            {msg.attachments?.length ? (
              <div className={`mt-3 space-y-2 rounded-lg border p-3 ${
                msg.role === "user"
                  ? "border-[#7fa8ff] bg-[#2a42b8]"
                  : "border-[#2a2a3e] bg-[#0a0a1a]"
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
                          msg.role === "user" ? "text-blue-100 hover:text-blue-200" : "text-blue-400 hover:text-blue-300"
                        }`}
                      >
                        📎 {attachment.file_name} ({Math.max(1, Math.round(attachment.size_bytes / 1024))} KB)
                      </a>
                      {isImage ? (
                        <img
                          src={resolvedUrl}
                          alt={attachment.file_name}
                          className="max-h-64 w-auto rounded-lg border border-[#2a2a3e] shadow-sm"
                        />
                      ) : null}
                      {isVideo ? (
                        <video
                          controls
                          src={resolvedUrl}
                          className="max-h-64 w-full rounded-lg border border-[#2a2a3e] shadow-sm"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Source tag and Refresh button (for assistant messages) */}
            {msg.role === "assistant" && (
              <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-[#2a2a3e]">
                <div className="text-xs opacity-60 text-slate-300">
                  {msg.source ? (
                    <span>Source: {msg.source}</span>
                  ) : (
                    <span>Generated response</span>
                  )}
                </div>
                {onRefreshMessage && (
                  <button
                    onClick={() => onRefreshMessage(msg.id)}
                    title="Refresh this response"
                    className="p-1 hover:bg-[#2a2a3e] rounded transition-colors opacity-60 hover:opacity-100"
                    aria-label="Refresh response"
                  >
                    <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </article>
        ))}

        {/* Skeleton loader for loading state */}
        {loadingOlder && <SkeletonLoader />}

        {/* "Load more" hint */}
        {hasMoreHistory && !loadingOlder ? (
          <p className="text-center text-xs text-slate-500">Scroll up to load older messages</p>
        ) : null}
      </div>

      {/* "Jump to Latest" button */}
      {showJumpToLatest && (
        <button
          onClick={jumpToLatest}
          className="fixed bottom-6 right-6 md:right-96 md:bottom-32 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-lg transition-all opacity-90 hover:opacity-100 flex items-center gap-2"
          aria-label="Jump to latest messages"
        >
          ↓ Latest
        </button>
      )}
    </>
  );
}

export default MessageList;
