import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";


type InputBarProps = {
  onSend: (value: string, files: File[]) => Promise<void>;
  onGenerateImage: (value: string) => Promise<void>;
  onUploadRagPdf: (file: File) => Promise<void>;
  isSending: boolean;
  focusSignal?: number;
};

function InputBar({ onSend, onGenerateImage, onUploadRagPdf, isSending, focusSignal = 0 }: InputBarProps) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusSignal]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if ((!trimmed && !files.length) || isSending) {
      return;
    }
    setValue("");
    const currentFiles = files;
    setFiles([]);
    await onSend(trimmed, currentFiles);
  };

  const generateImage = async () => {
    const prompt = value.trim();
    if (!prompt || isSending) {
      return;
    }
    setValue("");
    await onGenerateImage(prompt);
  };

  return (
    <form onSubmit={submit} className="border-t border-slate-200 pt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
          📎 Attach Files
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              if (!selected.length) {
                return;
              }
              setFiles((prev) => [...prev, ...selected]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
          📄 Upload PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) {
                return;
              }
              void onUploadRagPdf(selected);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {files.length ? (
          <span className="text-xs font-medium text-slate-600">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </span>
        ) : null}
      </div>

      {files.length ? (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {file.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                className="ml-1 hover:text-slate-900 font-bold"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type a message or ask a question..."
          rows={3}
          className="flex-1 resize-none rounded-lg border-2 border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-600 focus:border-[#3557e6] focus:ring-2 focus:ring-[#c2d6ff] outline-none transition shadow-sm"
        />
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={isSending || (!value.trim() && !files.length)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#1f318a] bg-[#3557e6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2a42b8] disabled:border-slate-400 disabled:bg-slate-400 disabled:text-white disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            ✈️ Send
          </button>
          <button
            type="button"
            onClick={() => void generateImage()}
            disabled={isSending || !value.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            🎨 Generate
          </button>
        </div>
      </div>
    </form>
  );
}

export default InputBar;
