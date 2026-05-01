import { useState } from "react";
import type { FormEvent } from "react";


type InputBarProps = {
  onSend: (value: string) => Promise<void>;
  isSending: boolean;
};

function InputBar({ onSend, isSending }: InputBarProps) {
  const [value, setValue] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isSending) {
      return;
    }
    setValue("");
    await onSend(trimmed);
  };

  return (
    <form onSubmit={submit} className="mt-4 flex items-end gap-3 border-t border-slate-200 pt-4">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Send a message..."
        rows={2}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring"
      />
      <button
        type="submit"
        disabled={isSending}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}

export default InputBar;
