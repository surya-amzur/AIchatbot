import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import InputBar from "../components/chat/InputBar";
import MessageList from "../components/chat/MessageList";
import { useAuthQuery, useLogoutMutation } from "../hooks/useAuth";
import {
  useChatHistoryQuery,
  useChatThreadsQuery,
  useDeleteThreadMutation,
  useGenerateImageMutation,
  useRenameThreadMutation,
  useSendMessageMutation,
} from "../hooks/useChat";
import {
  getNl2SqlSchema,
  queryNl2Sql,
  queryRag,
  queryTabularQa,
  uploadAttachments,
  uploadExcelForTabularQa,
  uploadGSheetForTabularQa,
  uploadPdfForRag,
  validateImageRules,
} from "../lib/api";
import type { Attachment, Message } from "../types";

function ChatPage() {
  const navigate = useNavigate();
  const authQuery = useAuthQuery();
  const logoutMutation = useLogoutMutation();
  const threadsQuery = useChatThreadsQuery();
  const sendMutation = useSendMessageMutation();
  const renameThreadMutation = useRenameThreadMutation();
  const deleteThreadMutation = useDeleteThreadMutation();
  const generateImageMutation = useGenerateImageMutation();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const historyQuery = useChatHistoryQuery(selectedThreadId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");
  const [ragDocumentIds, setRagDocumentIds] = useState<string[]>([]);
  const [tabularDocumentIds, setTabularDocumentIds] = useState<string[]>([]);
  const [nl2sqlQuestion, setNl2sqlQuestion] = useState<string>("");
  const [nl2sqlBusy, setNl2sqlBusy] = useState<boolean>(false);
  const [nl2sqlSchemaText, setNl2sqlSchemaText] = useState<string>("");
  const [gsheetUrl, setGsheetUrl] = useState<string>("");
  const [gsheetWorksheet, setGsheetWorksheet] = useState<string>("");
  const [tabularQuestion, setTabularQuestion] = useState<string>("");
  const [tabularBusy, setTabularBusy] = useState<boolean>(false);
  const [rulesText, setRulesText] = useState<string>("");
  const [imageRulesBusy, setImageRulesBusy] = useState<boolean>(false);

  useEffect(() => {
    if (authQuery.isError) {
      navigate("/", { replace: true });
    }
  }, [authQuery.isError, navigate]);

  useEffect(() => {
    if (!isDraftMode && historyQuery.data?.messages) {
      setMessages(historyQuery.data.messages);
    }
  }, [historyQuery.data, isDraftMode]);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      navigate("/", { replace: true });
    }
  };

  const handleSend = async (value: string, files: File[]) => {
    const normalizedMessage = value.trim() || "Please analyze the attached file(s).";

    if (!files.length && ragDocumentIds.length > 0) {
      const userMessage: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: normalizedMessage,
        created_at: new Date().toISOString(),
        attachments: [],
      };

      setError("");
      setMessages((prev) => [...prev, userMessage]);
      try {
        const rag = await queryRag(normalizedMessage, selectedThreadId, ragDocumentIds, 4);
        const assistantMessage: Message = {
          id: `r-${Date.now()}`,
          role: "assistant",
          content:
            rag.citations.length > 0
              ? `${rag.answer}\n\nSources:\n${rag.citations
                  .map((c) => `- ${c.file_name} (chunk ${c.chunk_index})`)
                  .join("\n")}`
              : rag.answer,
          created_at: new Date().toISOString(),
          attachments: [],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        if (!selectedThreadId) {
          setSelectedThreadId(rag.thread_id);
          setIsDraftMode(false);
        }
        await threadsQuery.refetch();
        await historyQuery.refetch();
      } catch {
        setError("RAG query failed. Upload a PDF and try again.");
      }
      return;
    }

    let uploadedAttachments: Attachment[] = [];
    if (files.length) {
      try {
        uploadedAttachments = await uploadAttachments(files);
      } catch {
        setError("Failed to upload one or more attachments.");
        return;
      }
    }

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: normalizedMessage,
      created_at: new Date().toISOString(),
      attachments: uploadedAttachments,
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
        message: normalizedMessage,
        threadId: selectedThreadId,
        attachments: uploadedAttachments,
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

  const handleUploadRagPdf = async (file: File) => {
    try {
      const uploaded = await uploadPdfForRag(file, selectedThreadId);
      setRagDocumentIds((prev) => [...prev, uploaded.document_id]);
      setError("");
    } catch {
      setError("Failed to upload PDF for RAG.");
    }
  };

  const handleLoadNl2SqlSchema = async () => {
    setError("");
    setNl2sqlBusy(true);
    try {
      const schema = await getNl2SqlSchema();
      const lines = schema.tables.map(
        (table) => `${table.name}: ${table.columns.map((col) => `${col.name} (${col.type})`).join(", ")}`,
      );
      setNl2sqlSchemaText(lines.join("\n"));
    } catch {
      setError("Failed to load NL2SQL schema.");
    } finally {
      setNl2sqlBusy(false);
    }
  };

  const handleQueryNl2Sql = async () => {
    const question = nl2sqlQuestion.trim();
    if (!question) {
      return;
    }

    setError("");
    setNl2sqlBusy(true);
    try {
      const result = await queryNl2Sql(question, 100);
      const previewRows = result.rows.slice(0, 8);
      const previewJson = JSON.stringify(previewRows, null, 2);
      const assistantMessage: Message = {
        id: `nl2sql-${Date.now()}`,
        role: "assistant",
        content:
          `NL2SQL SQL:\n\n\`\`\`sql\n${result.sql}\n\`\`\`\n\n` +
          `Rows: ${result.row_count}\n\n` +
          `Preview:\n\n\`\`\`json\n${previewJson}\n\`\`\``,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setNl2sqlQuestion("");
    } catch {
      setError("NL2SQL query failed.");
    } finally {
      setNl2sqlBusy(false);
    }
  };

  const handleUploadTabularExcel = async (file: File) => {
    setError("");
    setTabularBusy(true);
    try {
      const uploaded = await uploadExcelForTabularQa(file, selectedThreadId);
      setTabularDocumentIds((prev) => [...prev, uploaded.document_id]);
      const assistantMessage: Message = {
        id: `tabular-upload-${Date.now()}`,
        role: "assistant",
        content: `Tabular dataset loaded: ${uploaded.source_name} (${uploaded.row_count} rows).`,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setError("Failed to upload Excel for tabular QA.");
    } finally {
      setTabularBusy(false);
    }
  };

  const handleUploadTabularGsheet = async () => {
    if (!gsheetUrl.trim()) {
      return;
    }
    setError("");
    setTabularBusy(true);
    try {
      const uploaded = await uploadGSheetForTabularQa(
        gsheetUrl.trim(),
        gsheetWorksheet.trim() || null,
        selectedThreadId,
      );
      setTabularDocumentIds((prev) => [...prev, uploaded.document_id]);
      const assistantMessage: Message = {
        id: `tabular-gsheet-${Date.now()}`,
        role: "assistant",
        content: `Google Sheet loaded: ${uploaded.source_name} (${uploaded.row_count} rows).`,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setGsheetUrl("");
      setGsheetWorksheet("");
    } catch {
      setError("Failed to load Google Sheet for tabular QA.");
    } finally {
      setTabularBusy(false);
    }
  };

  const handleQueryTabular = async () => {
    const question = tabularQuestion.trim();
    if (!question || tabularDocumentIds.length === 0) {
      return;
    }
    setError("");
    setTabularBusy(true);
    try {
      const result = await queryTabularQa(question, selectedThreadId, tabularDocumentIds, 6);
      const assistantMessage: Message = {
        id: `tabular-answer-${Date.now()}`,
        role: "assistant",
        content:
          result.citations.length > 0
            ? `${result.answer}\n\nTabular sources:\n${result.citations
                .map((c) => `- ${c.source_name} (row ${c.row_index})`)
                .join("\n")}`
            : result.answer,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setTabularQuestion("");
      if (!selectedThreadId) {
        setSelectedThreadId(result.thread_id);
        setIsDraftMode(false);
      }
    } catch {
      setError("Tabular QA query failed.");
    } finally {
      setTabularBusy(false);
    }
  };

  const handleValidateImageRules = async (file: File) => {
    const rules = rulesText.trim();
    if (!rules) {
      setError("Enter rules before validating an image.");
      return;
    }
    setError("");
    setImageRulesBusy(true);
    try {
      const result = await validateImageRules(file, rules, selectedThreadId);
      const extracted = JSON.stringify(result.extracted_data, null, 2);
      const lines = result.results
        .map((ruleResult) => `${ruleResult.passed ? "PASS" : "FAIL"}: ${ruleResult.rule} (${ruleResult.evidence})`)
        .join("\n");
      const assistantMessage: Message = {
        id: `image-rules-${Date.now()}`,
        role: "assistant",
        content:
          `Image rules result for ${result.image_name}:\n\n` +
          `Extracted data:\n\n\`\`\`json\n${extracted}\n\`\`\`\n\n` +
          `${lines}`,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (!selectedThreadId) {
        setSelectedThreadId(result.thread_id);
        setIsDraftMode(false);
      }
    } catch {
      setError("Image rule validation failed.");
    } finally {
      setImageRulesBusy(false);
    }
  };

  const handleRenameThread = async (threadId: string, currentTitle: string) => {
    const nextTitle = window.prompt("Rename this thread", currentTitle);
    if (nextTitle === null) {
      return;
    }

    try {
      await renameThreadMutation.mutateAsync({ threadId, title: nextTitle });
      await threadsQuery.refetch();
      if (selectedThreadId === threadId) {
        await historyQuery.refetch();
      }
    } catch {
      setError("Unable to rename thread.");
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!window.confirm("Delete this thread and all its messages?")) {
      return;
    }

    try {
      await deleteThreadMutation.mutateAsync(threadId);
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
        setIsDraftMode(false);
      }
      await threadsQuery.refetch();
    } catch {
      setError("Unable to delete thread.");
    }
  };

  const handleGenerateImage = async (prompt: string) => {
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString(),
      attachments: [],
    };

    setError("");
    setMessages((prev) => [...prev, userMessage]);

    try {
      const generated = await generateImageMutation.mutateAsync({
        prompt,
        threadId: selectedThreadId,
      });

      const assistantImageMessage: Message = {
        id: `img-${Date.now()}`,
        role: "assistant",
        content: `Generated image for prompt: ${prompt}`,
        created_at: new Date().toISOString(),
        attachments: [generated.attachment],
      };

      setMessages((prev) => [...prev, assistantImageMessage]);

      if (!selectedThreadId) {
        setSelectedThreadId(generated.thread_id);
        setIsDraftMode(false);
      }

      await threadsQuery.refetch();
      if (selectedThreadId || generated.thread_id) {
        await historyQuery.refetch();
      }
    } catch {
      setError("Failed to generate image.");
    }
  };

  const heading = useMemo(() => {
    const name = authQuery.data?.name;
    return name ? `Chat - ${name}` : "Chat";
  }, [authQuery.data]);

  const isSending =
    sendMutation.isPending || generateImageMutation.isPending || nl2sqlBusy || tabularBusy || imageRulesBusy;

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDraftMode(false);
                  setSelectedThreadId(null);
                  setError("");
                }}
                className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                  !isDraftMode && selectedThreadId === null
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-slate-100 text-slate-700"
                }`}
              >
                All Chats
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDraftMode(true);
                  setSelectedThreadId(null);
                  setMessages([]);
                  setError("");
                }}
                className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                  isDraftMode
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-slate-100 text-slate-700"
                }`}
              >
                New Chat
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {threadsQuery.data?.threads.map((thread) => (
              <div
                key={thread.id}
                className={`w-full rounded-xl border px-3 py-2 text-left ${
                  selectedThreadId === thread.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsDraftMode(false);
                    setSelectedThreadId(thread.id);
                  }}
                  className="w-full text-left"
                >
                  <p className="text-sm font-medium">{thread.title}</p>
                  {thread.last_message ? (
                    <p className="mt-1 line-clamp-2 text-xs opacity-80">{thread.last_message}</p>
                  ) : null}
                </button>
                <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => void handleRenameThread(thread.id, thread.title)}
                    className="rounded border border-current px-2 py-1 opacity-80 hover:opacity-100"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteThread(thread.id)}
                    className="rounded border border-current px-2 py-1 opacity-80 hover:opacity-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <MessageList messages={messages} />

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">NL2SQL</p>
              <textarea
                value={nl2sqlQuestion}
                onChange={(event) => setNl2sqlQuestion(event.target.value)}
                rows={2}
                placeholder="Ask database question"
                className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleLoadNl2SqlSchema()}
                  disabled={nl2sqlBusy}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  Load Schema
                </button>
                <button
                  type="button"
                  onClick={() => void handleQueryNl2Sql()}
                  disabled={nl2sqlBusy || !nl2sqlQuestion.trim()}
                  className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                >
                  Run NL2SQL
                </button>
              </div>
              {nl2sqlSchemaText ? (
                <pre className="max-h-24 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px]">
                  {nl2sqlSchemaText}
                </pre>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Excel / GSheet QA</p>
              <label className="block cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs">
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) {
                      return;
                    }
                    void handleUploadTabularExcel(selected);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <input
                value={gsheetUrl}
                onChange={(event) => setGsheetUrl(event.target.value)}
                placeholder="Google Sheet URL or key"
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                value={gsheetWorksheet}
                onChange={(event) => setGsheetWorksheet(event.target.value)}
                placeholder="Worksheet (optional)"
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleUploadTabularGsheet()}
                disabled={tabularBusy || !gsheetUrl.trim()}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                Load GSheet
              </button>
              <textarea
                value={tabularQuestion}
                onChange={(event) => setTabularQuestion(event.target.value)}
                rows={2}
                placeholder="Ask tabular question"
                className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleQueryTabular()}
                disabled={tabularBusy || !tabularQuestion.trim() || tabularDocumentIds.length === 0}
                className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
              >
                Query Tabular
              </button>
              {tabularDocumentIds.length ? (
                <p className="text-[11px] text-slate-500">Loaded datasets: {tabularDocumentIds.length}</p>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Image Rule Validation</p>
              <textarea
                value={rulesText}
                onChange={(event) => setRulesText(event.target.value)}
                rows={3}
                placeholder={'Rules (JSON list or lines)\nex: ["Total <= 100", "Invoice number exists"]'}
                className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <label className="block cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs">
                Upload Image and Validate
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) {
                      return;
                    }
                    void handleValidateImageRules(selected);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Uses multimodal LLM and returns per-rule pass/fail with evidence.
              </p>
            </div>
          </div>

          {ragDocumentIds.length > 0 ? (
            <p className="mb-2 text-xs text-slate-600">
              RAG mode active with {ragDocumentIds.length} document(s). Your next text messages query uploaded PDFs.
            </p>
          ) : null}
          <InputBar
            onSend={handleSend}
            onGenerateImage={handleGenerateImage}
            onUploadRagPdf={handleUploadRagPdf}
            isSending={isSending}
          />
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

export default ChatPage;
