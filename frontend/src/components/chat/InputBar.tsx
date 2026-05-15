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

  useEffect(() => {
    if (focusSignal && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [focusSignal]);

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="space-y-2">
        {/* File uploads */}
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer rounded-lg border border-slate-600 bg-[#1a1a2e] px-4 py-3 text-xs font-medium text-slate-300 hover:bg-[#2a2a3e] hover:text-slate-200 text-center transition-colors">
            📎 Attach Files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          <label className="flex-1 cursor-pointer rounded-lg border border-slate-600 bg-[#1a1a2e] px-4 py-3 text-xs font-medium text-slate-300 hover:bg-[#2a2a3e] hover:text-slate-200 text-center transition-colors">
            📄 Upload PDF
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleUploadPdf}
            />
          </label>
        </div>

        {/* Selected files indicator */}
        {files.length > 0 && (
          <div className="text-xs text-blue-400 bg-blue-900 bg-opacity-20 px-3 py-2 rounded-lg">
            {files.length} file(s) selected
          </div>
        )}

        {/* Message input textarea */}
        <div className="space-y-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Type your message or ask a question..."
            rows={3}
            className="w-full resize-none rounded-lg border-2 border-slate-600 bg-[#1a1a2e] px-4 py-3 text-sm font-medium text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition shadow-sm"
          />
          {value.length > MAX_MESSAGE_LENGTH * 0.8 && (
            <p className={`text-xs text-right ${value.length >= MAX_MESSAGE_LENGTH ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              {value.length}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </div>

      {/* Button group - vertical stack */}
      <div className="flex flex-col gap-2">
        {/* Primary: Send button */}
        <div className="relative">
          <button
            type="submit"
            disabled={isSending || (!value.trim() && !files.length) || value.length > MAX_MESSAGE_LENGTH}
            onMouseEnter={() => setShowTooltip("send")}
            onMouseLeave={() => setShowTooltip(null)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 border-blue-600 bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-600 disabled:from-slate-500 disabled:to-slate-500 disabled:border-slate-500 disabled:text-slate-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
          >
            {isSending ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5.951-1.488 5.951 1.488a1 1 0 001.169-1.409l-7-14z" />
                </svg>
                <span>Send</span>
              </>
            )}
          </button>
          {/* Tooltip */}
          {showTooltip === "send" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-xs px-3 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
              Send your message to the assistant
            </div>
          )}
        </div>

        {/* Secondary: Generate button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => void generateImage()}
            disabled={isSending || !value.trim()}
            onMouseEnter={() => setShowTooltip("generate")}
            onMouseLeave={() => setShowTooltip(null)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-600 bg-transparent px-5 py-3 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:bg-[#2a2a3e] hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H3zM14.586 7.586a1 1 0 00-1.414 0L10 11.172 7.828 9a1 1 0 00-1.414 0l-2.828 2.828a1 1 0 101.414 1.414L7 11.414l2.172 2.172a1 1 0 001.414 0l4-4a1 1 0 000-1.414z" />
            </svg>
            <span>Generate</span>
          </button>
          {/* Tooltip */}
          {showTooltip === "generate" && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-xs px-3 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
              AI-generate a response draft
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

export default InputBar;
