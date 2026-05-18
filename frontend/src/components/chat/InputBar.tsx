import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

const MAX_MESSAGE_LENGTH = 8000;

type InputBarProps = {
  onSend: (value: string, files: File[]) => Promise<void>;
  onGenerateImage: (value: string) => Promise<void>;
  onUploadRagPdf: (file: File) => Promise<void>;
  isSending: boolean;
  focusSignal?: number;
};

function InputBar({ onSend, onGenerateImage, onUploadRagPdf, isSending, focusSignal = 0 }: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showTooltip, setShowTooltip] = useState<"send" | "generate" | null>(null);

  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    if (focusSignal && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    autoResizeTextarea();
  }, [value]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() && !files.length) {
      return;
    }
    try {
      await onSend(value, files);
      setValue("");
      setFiles([]);
    } catch {
      // Error is handled by caller
    }
  };

  const generateImage = async () => {
    try {
      await onGenerateImage(value);
      setValue("");
    } catch {
      // Error is handled by caller
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      setFiles(Array.from(selectedFiles));
    }
  };

  const handleUploadPdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      await onUploadRagPdf(selected);
      event.currentTarget.value = "";
    } catch {
      // Error is handled by caller
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      {/* Top toolbar: uploads + char count */}
      <div className="flex items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-600 bg-[#1a1a2e] px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-[#2a2a3e] hover:text-slate-200 transition-colors" title="Attach files">
          📎 <span>Files</span>
          <input type="file" multiple className="hidden" onChange={handleFileChange} />
        </label>
        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-600 bg-[#1a1a2e] px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-[#2a2a3e] hover:text-slate-200 transition-colors" title="Upload PDF for RAG">
          📄 <span>PDF</span>
          <input type="file" accept=".pdf" className="hidden" onChange={handleUploadPdf} />
        </label>
        {files.length > 0 && (
          <span className="ml-auto text-[10px] text-blue-400">{files.length} file(s)</span>
        )}
        {value.length > MAX_MESSAGE_LENGTH * 0.8 && (
          <span className={`ml-auto text-[10px] ${value.length >= MAX_MESSAGE_LENGTH ? "text-red-500 font-semibold" : "text-slate-500"}`}>
            {value.length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value.slice(0, MAX_MESSAGE_LENGTH));
        }}
        placeholder="Type your message or ask a question..."
        rows={2}
        className="w-full resize-none overflow-y-scroll min-h-[52px] max-h-40 rounded-md border border-slate-600 bg-[#1a1a2e] px-3 py-2 pr-1 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-transparent hover:scrollbar-thumb-slate-400"
      />

      {/* Send + Generate row */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <button
            type="submit"
            disabled={isSending || (!value.trim() && !files.length) || value.length > MAX_MESSAGE_LENGTH}
            onMouseEnter={() => setShowTooltip("send")}
            onMouseLeave={() => setShowTooltip(null)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <>
                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5.951-1.488 5.951 1.488a1 1 0 001.169-1.409l-7-14z" />
                </svg>
                Send
              </>
            )}
          </button>
          {showTooltip === "send" && (
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
              Send message
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => void generateImage()}
            disabled={isSending || !value.trim()}
            onMouseEnter={() => setShowTooltip("generate")}
            onMouseLeave={() => setShowTooltip(null)}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-500 hover:bg-[#2a2a3e] hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
              <path d="M14.586 7.586a1 1 0 00-1.414 0L10 11.172 7.828 9a1 1 0 00-1.414 0l-2.828 2.828a1 1 0 101.414 1.414L7 11.414l2.172 2.172a1 1 0 001.414 0l4-4a1 1 0 000-1.414z" />
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V5zm2 1v8h10V6H5z" clipRule="evenodd" />
            </svg>
            Generate
          </button>
          {showTooltip === "generate" && (
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
              Generate image
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

export default InputBar;
