import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import type { Message } from "../../types";
import { apiClient } from "../../lib/api";


type MessageListProps = {
  messages: Message[];
};

function MessageList({ messages }: MessageListProps) {
  const baseUrl = apiClient.defaults.baseURL ?? "";

  const resolveUrl = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return `${baseUrl}${url}`;
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2">
      {messages.map((msg) => (
        <article
          key={msg.id}
          className={
            msg.role === "user"
              ? "ml-auto max-w-[85%] rounded-2xl bg-slate-900 px-4 py-3 text-white"
              : "mr-auto max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          }
        >
          <p className="mb-2 text-xs uppercase tracking-wide opacity-70">{msg.role}</p>
          <div className="prose prose-sm max-w-none text-justify text-inherit prose-p:my-2 prose-pre:overflow-x-auto prose-code:rounded prose-code:bg-slate-200 prose-code:px-1 prose-code:py-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {msg.content}
            </ReactMarkdown>
          </div>

          {msg.attachments?.length ? (
            <div className="mt-3 space-y-2 rounded-xl border border-slate-200/60 bg-white/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Attachments</p>
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
                      className="block text-xs font-medium underline"
                    >
                      {attachment.file_name} ({Math.max(1, Math.round(attachment.size_bytes / 1024))} KB)
                    </a>
                    {isImage ? (
                      <img
                        src={resolvedUrl}
                        alt={attachment.file_name}
                        className="max-h-64 w-auto rounded-lg border border-slate-200"
                      />
                    ) : null}
                    {isVideo ? (
                      <video
                        controls
                        src={resolvedUrl}
                        className="max-h-64 w-full rounded-lg border border-slate-200"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export default MessageList;
