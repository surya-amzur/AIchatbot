import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import type { Message } from "../../types";


type MessageListProps = {
  messages: Message[];
};

function MessageList({ messages }: MessageListProps) {
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
        </article>
      ))}
    </div>
  );
}

export default MessageList;
