import { useState } from "react";
import type { FormEvent } from "react";


type InputBarProps = {
  onSend: (value: string, files: File[]) => Promise<void>;
  onGenerateImage: (value: string) => Promise<void>;
  onUploadRagPdf: (file: File) => Promise<void>;
  isSending: boolean;
};

function InputBar({ onSend, onGenerateImage, onUploadRagPdf, isSending }: InputBarProps) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);

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
    <form onSubmit={submit} className="mt-4 border-t border-slate-200 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200">
          Attach files
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
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
          Upload PDF for RAG
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
        {files.length ? <p className="text-xs text-slate-600">{files.length} file(s) selected</p> : null}
      </div>

      {files.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700"
            >
              {file.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Send a message or upload attachments..."
        rows={2}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring"
      />
      <button
        type="button"
        onClick={() => void generateImage()}
        disabled={isSending || !value.trim()}
        className="rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Generate Image
      </button>
      <button
        type="submit"
        disabled={isSending}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? "Sending..." : "Send"}
      </button>
      </div>
    </form>
  );
}

export default InputBar;
