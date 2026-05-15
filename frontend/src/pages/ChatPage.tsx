import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "../components/layout/AppShell";
import Button from "../components/ui/Button";
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
  getHistory,
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

const HISTORY_PAGE_SIZE = 30;

type OnboardingChecklistState = {
  loadedData: boolean;
  askedQuestion: boolean;
  receivedAnswer: boolean;
  hidden: boolean;
};

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
  const [tabularError, setTabularError] = useState<string>("");
  const [tabularSuccess, setTabularSuccess] = useState<string>("");
  const [rulesText, setRulesText] = useState<string>("");
  const [imageRulesBusy, setImageRulesBusy] = useState<boolean>(false);
  const [historyOffset, setHistoryOffset] = useState<number>(0);
  const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<"ask" | "analyze" | "image">("ask");
  const [mobilePanel, setMobilePanel] = useState<"none" | "tools" | "threads">("none");
  const [composerFocusSignal, setComposerFocusSignal] = useState<number>(0);
  const [onboardingChecklist, setOnboardingChecklist] = useState<OnboardingChecklistState>(() => {
    if (typeof window === "undefined") {
      return { loadedData: false, askedQuestion: false, receivedAnswer: false, hidden: false };
    }
    try {
      const raw = window.localStorage.getItem("amzur_onboarding_checklist");
      if (!raw) {
        return { loadedData: false, askedQuestion: false, receivedAnswer: false, hidden: false };
      }
      const parsed = JSON.parse(raw) as Partial<OnboardingChecklistState>;
      return {
        loadedData: Boolean(parsed.loadedData),
        askedQuestion: Boolean(parsed.askedQuestion),
        receivedAnswer: Boolean(parsed.receivedAnswer),
        hidden: Boolean(parsed.hidden),
      };
    } catch {
      return { loadedData: false, askedQuestion: false, receivedAnswer: false, hidden: false };
    }
  });
  const nl2SqlSectionRef = useRef<HTMLDivElement | null>(null);
  const tabularSectionRef = useRef<HTMLDivElement | null>(null);
  const imageRulesSectionRef = useRef<HTMLDivElement | null>(null);
  const threadsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeMode === "analyze") {
      setTimeout(() => tabularSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (activeMode === "image") {
      setTimeout(() => imageRulesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } else if (activeMode === "ask") {
      setTimeout(() => composerFocusSignal === 0 && setComposerFocusSignal(1), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  // Scroll loading for threads panel
  const handleThreadsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isAtBottom && threadsQuery.data?.threads.length) {
      // Trigger refetch to load more threads if available
      void threadsQuery.refetch();
    }
  };
  const nl2sqlQuestionRef = useRef<HTMLTextAreaElement | null>(null);
  const tabularQuestionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (authQuery.isError) {
      navigate("/", { replace: true });
    }
  }, [authQuery.isError, navigate]);

  useEffect(() => {
    if (!isDraftMode && historyQuery.data?.messages) {
      setMessages(historyQuery.data.messages);
      setHistoryOffset(historyQuery.data.messages.length);
      setHasMoreHistory(historyQuery.data.has_more);
    }
  }, [historyQuery.data, isDraftMode]);

  const hasDataSource = ragDocumentIds.length > 0 || tabularDocumentIds.length > 0 || Boolean(nl2sqlSchemaText.trim());
  const hasUserPrompt = messages.some((m) => m.role === "user" && m.content.trim().length > 0);
  const hasAssistantReply = messages.some((m) => m.role === "assistant" && m.content.trim().length > 0);

  useEffect(() => {
    setOnboardingChecklist((prev) => {
      const next: OnboardingChecklistState = {
        ...prev,
        loadedData: prev.loadedData || hasDataSource,
        askedQuestion: prev.askedQuestion || hasUserPrompt,
        receivedAnswer: prev.receivedAnswer || hasAssistantReply,
      };
      if (
        next.loadedData === prev.loadedData &&
        next.askedQuestion === prev.askedQuestion &&
        next.receivedAnswer === prev.receivedAnswer &&
        next.hidden === prev.hidden
      ) {
        return prev;
      }
      return next;
    });
  }, [hasAssistantReply, hasDataSource, hasUserPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("amzur_onboarding_checklist", JSON.stringify(onboardingChecklist));
  }, [onboardingChecklist]);

  const loadOlderHistory = async () => {
    if (!selectedThreadId || loadingOlderHistory || !hasMoreHistory || isDraftMode) {
      return;
    }

    setLoadingOlderHistory(true);
    try {
      const older = await getHistory(selectedThreadId, { offset: historyOffset, limit: HISTORY_PAGE_SIZE });
      if (!older.messages.length) {
        setHasMoreHistory(false);
        return;
      }

      setMessages((prev) => [...older.messages, ...prev]);
      setHistoryOffset((prev) => prev + older.messages.length);
      setHasMoreHistory(older.has_more);
    } catch {
      setError("Failed to load older chat history.");
    } finally {
      setLoadingOlderHistory(false);
    }
  };

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
      setComposerFocusSignal(Date.now());
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
      nl2sqlQuestionRef.current?.focus();
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
      tabularQuestionRef.current?.focus();
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
    setTabularError("");
    setError("");
    setTabularBusy(true);
    try {
      const uploaded = await uploadGSheetForTabularQa(
        gsheetUrl.trim(),
        gsheetWorksheet.trim() || null,
        selectedThreadId,
      );
      setTabularDocumentIds((prev) => [...prev, uploaded.document_id]);
      setTabularError("");
      setTabularSuccess(`✅ Successfully loaded: ${uploaded.source_name} (${uploaded.row_count} rows)`);
      setTimeout(() => setTabularSuccess(""), 5000);
      tabularQuestionRef.current?.focus();
      const assistantMessage: Message = {
        id: `tabular-gsheet-${Date.now()}`,
        role: "assistant",
        content: `Google Sheet loaded: ${uploaded.source_name} (${uploaded.row_count} rows).`,
        created_at: new Date().toISOString(),
        attachments: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: { message?: string } | string } } };
      const detail = axiosErr?.response?.data?.detail;
      const msg =
        typeof detail === "object" && detail?.message
          ? detail.message
          : typeof detail === "string"
          ? detail
          : "Failed to load Google Sheet for tabular QA.";
      setTabularError(msg);
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
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: { message?: string } | string } } };
      const detail = axiosErr?.response?.data?.detail;
      const msg =
        typeof detail === "object" && detail?.message
          ? detail.message
          : typeof detail === "string"
          ? detail
          : "Tabular QA query failed.";
      setError(msg);
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

  const nextStepHint = useMemo(() => {
    if (!hasDataSource) {
      return "Step 1: Load schema, sheet, or PDF so the assistant has context.";
    }
    if (!messages.length) {
      return "Step 2: Ask your first question in the chat composer.";
    }
    return "Step 3: Continue the conversation or switch threads from the header.";
  }, [messages.length, nl2sqlSchemaText, ragDocumentIds.length, tabularDocumentIds.length]);

  const scrollToSection = (ref: { current: HTMLDivElement | null }) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobilePanel("none");
  };

  const isSending =
    sendMutation.isPending || generateImageMutation.isPending || nl2sqlBusy || tabularBusy || imageRulesBusy;

  const handleRefreshMessage = (messageId: string) => {
    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) return;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        void handleSend(messages[i].content, []);
        return;
      }
    }
  };


  return (
    <AppShell
      title={heading}
      subtitle="Enterprise AI workspace"
      tabs={([
        { key: "ask", label: "Ask", active: activeMode === "ask", onClick: () => { setActiveMode("ask"); setMobilePanel("tools"); } },
        { key: "analyze", label: "Analyze Data", active: activeMode === "analyze", onClick: () => { setActiveMode("analyze"); setMobilePanel("tools"); } },
        { key: "image", label: "Validate Image", active: activeMode === "image", onClick: () => { setActiveMode("image"); setMobilePanel("tools"); } },
      ] as const)}
      actions={
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 md:flex">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setMobilePanel((prev) => (prev === "tools" ? "none" : "tools"))}
            >
              Tools
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setMobilePanel((prev) => (prev === "threads" ? "none" : "threads"))}
            >
              Threads
            </Button>
          </div>
          <div className="hidden xl:block">
            <select
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__all__") {
                  setIsDraftMode(false);
                  setSelectedThreadId(null);
                  return;
                }
                if (value === "__draft__") {
                  setIsDraftMode(true);
                  setSelectedThreadId(null);
                  setMessages([]);
                  return;
                }
                setIsDraftMode(false);
                setSelectedThreadId(value);
              }}
              className="h-8 max-w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-secondary)] outline-none transition focus:border-[var(--color-primary-500)]"
            >
              <option value="__all__">All Conversations</option>
              <option value="__draft__">New Draft</option>
              {threadsQuery.data?.threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={handleLogout}>Logout</Button>
        </div>
      }
    >
      <section className="flex flex-1 flex-col gap-2 overflow-hidden md:flex-row md:gap-3">
        <aside
          className={`${mobilePanel === "tools" ? "flex" : "hidden"} w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-soft)] md:flex md:w-80 md:gap-3 md:p-3`}
        >
          <div className="flex flex-col gap-2">
            <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Navigator</p>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => scrollToSection(nl2SqlSectionRef)}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  NL2SQL
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection(tabularSectionRef)}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Tabular
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection(imageRulesSectionRef)}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Image
                </button>
              </div>
              <p className="rounded-md bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 leading-tight">{nextStepHint}</p>
            </div>

            {/* NL2SQL Section */}
            <div ref={nl2SqlSectionRef} className={`space-y-3 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-4 border-2 ${activeMode === "ask" ? "border-[#3557e6]" : "border-slate-200"}` }>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-brand-700">📊</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">NL2SQL Query</p>
              </div>
              <textarea
                ref={nl2sqlQuestionRef}
                value={nl2sqlQuestion}
                onChange={(event) => setNl2sqlQuestion(event.target.value)}
                rows={2}
                placeholder="Ask your database..."
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleLoadNl2SqlSchema()}
                  disabled={nl2sqlBusy}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  Load Schema
                </button>
                <button
                  type="button"
                  onClick={() => void handleQueryNl2Sql()}
                  disabled={nl2sqlBusy || !nl2sqlQuestion.trim()}
                  className="flex-1 rounded-lg border border-[#1f318a] bg-[#3557e6] px-3 py-2 text-xs font-medium text-white hover:bg-[#2a42b8] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  Run Query
                </button>
              </div>
              {nl2sqlSchemaText ? (
                <pre className="max-h-20 overflow-auto rounded-lg border border-slate-300 bg-white p-2 text-[10px] text-slate-700">
                  {nl2sqlSchemaText}
                </pre>
              ) : null}
            </div>

            {/* Excel/GSheet Section */}
            <div ref={tabularSectionRef} className={`space-y-3 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-4 border-2 ${activeMode === "analyze" ? "border-[#3557e6]" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-brand-700">📈</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">Tabular Data</p>
              </div>
              <label className="block cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 text-center transition-colors">
                📁 Upload Excel
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
                placeholder="Google Sheet URL or ID"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              <input
                value={gsheetWorksheet}
                onChange={(event) => setGsheetWorksheet(event.target.value)}
                placeholder="Sheet name (optional)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              <button
                type="button"
                onClick={() => void handleUploadTabularGsheet()}
                disabled={tabularBusy || !gsheetUrl.trim()}
                className="w-full rounded-lg border border-[#1f318a] bg-[#3557e6] px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#2a42b8] disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
              >
                {tabularBusy ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    Loading Sheet...
                  </span>
                ) : (
                  "📥 Load GSheet"
                )}
              </button>
              {tabularSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-700 font-medium">
                  {tabularSuccess}
                </div>
              ) : null}
              {tabularError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  <p className="font-semibold mb-1">⚠️ Failed to load sheet</p>
                  <p>{tabularError}</p>
                  <p className="mt-1 text-red-500">Make sure the sheet is shared with: <span className="font-mono font-semibold break-all">amzurchatbot@chatbot-495005.iam.gserviceaccount.com</span></p>
                </div>
              ) : null}
              <textarea
                ref={tabularQuestionRef}
                value={tabularQuestion}
                onChange={(event) => setTabularQuestion(event.target.value)}
                rows={2}
                placeholder="Ask about the data..."
                className="w-full resize-none rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 transition shadow-md"
              />
              <button
                type="button"
                onClick={() => void handleQueryTabular()}
                disabled={tabularBusy || !tabularQuestion.trim() || tabularDocumentIds.length === 0}
                className="w-full rounded-lg border border-[#1f318a] bg-[#3557e6] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2a42b8] disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                {tabularBusy ? "Querying..." : "🔍 Query Data"}
              </button>
              {tabularDocumentIds.length ? (
                <p className="text-[11px] text-slate-600">📊 {tabularDocumentIds.length} dataset(s) loaded</p>
              ) : null}
            </div>

            {/* Image Rules Section */}
            <div ref={imageRulesSectionRef} className={`space-y-3 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-4 border-2 ${activeMode === "image" ? "border-[#3557e6]" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-brand-700">🖼️</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">Image Validation</p>
              </div>
              <textarea
                value={rulesText}
                onChange={(event) => setRulesText(event.target.value)}
                rows={2}
                placeholder="Define validation rules..."
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              <label className="block cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 text-center transition-colors">
                🖼️ Upload Image
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
            </div>
          </div>
        </aside>

        <div
          className={`${mobilePanel === "none" ? "flex" : "hidden"} min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-soft)] md:flex md:gap-2 md:p-3 lg:p-3`}
        >
          {!onboardingChecklist.hidden ? (
            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
              <div className="mb-0.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Onboarding</p>
                <button
                  type="button"
                  onClick={() => setOnboardingChecklist((prev) => ({ ...prev, hidden: true }))}
                  className="text-[10px] font-medium text-slate-500 hover:text-slate-700"
                >
                  Hide
                </button>
              </div>
              <div className="grid gap-0.5 text-[10px] text-slate-700 md:grid-cols-3">
                <p>{onboardingChecklist.loadedData ? "✅" : "⬜"} Load</p>
                <p>{onboardingChecklist.askedQuestion ? "✅" : "⬜"} Ask</p>
                <p>{onboardingChecklist.receivedAnswer ? "✅" : "⬜"} Answer</p>
              </div>
            </div>
          ) : null}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700">
            <span className="font-semibold text-slate-900">Next:</span> {nextStepHint}
          </div>
          <MessageList
            messages={messages}
            hasMoreHistory={hasMoreHistory}
            loadingOlder={loadingOlderHistory}
            onLoadOlder={() => {
              void loadOlderHistory();
            }}
           onRefreshMessage={handleRefreshMessage} />
          {ragDocumentIds.length > 0 ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-900">
              📄 RAG: {ragDocumentIds.length} doc(s)
            </div>
          ) : null}
          <InputBar
            onSend={handleSend}
            onGenerateImage={handleGenerateImage}
            onUploadRagPdf={handleUploadRagPdf}
            isSending={isSending}
            focusSignal={composerFocusSignal}
          />
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-900">
              ⚠️ {error}
            </div>
          ) : null}
        </div>

        <aside
          ref={threadsContainerRef}
          onScroll={handleThreadsScroll}
          className={`${mobilePanel === "threads" ? "flex" : "hidden"} w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-soft)] md:hidden xl:flex xl:w-80 xl:gap-3 xl:p-3`}
        >
          <div className="mb-1 flex items-center justify-between gap-1">
            <h2 className="text-xs font-semibold text-slate-900">Conversations</h2>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsDraftMode(false);
                  setSelectedThreadId(null);
                  setError("");
                }}
                className={`rounded-lg px-1.5 py-0.5 text-xs font-medium transition-colors ${
                  !isDraftMode && selectedThreadId === null
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDraftMode(true);
                  setSelectedThreadId(null);
                  setMessages([]);
                  setError("");
                }}
                className={`rounded-lg px-1.5 py-0.5 text-xs font-medium transition-colors ${
                  isDraftMode
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                New
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {threadsQuery.data?.threads.map((thread) => (
              <div
                key={thread.id}
                className={`w-full rounded-lg border p-2 text-left transition-all ${
                  selectedThreadId === thread.id
                    ? "border-brand-500 bg-brand-50 shadow-sm"
                    : "border-slate-200 bg-white hover:bg-slate-50"
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
                  <p className={`text-xs font-medium leading-tight ${selectedThreadId === thread.id ? "text-brand-900" : "text-slate-900"}`}>
                    {thread.title}
                  </p>
                  {thread.last_message ? (
                    <p className={`mt-0.5 line-clamp-1 text-[11px] leading-tight ${selectedThreadId === thread.id ? "text-brand-700" : "text-slate-600"}`}>
                      {thread.last_message}
                    </p>
                  ) : null}
                </button>
                <div className="mt-1 flex items-center justify-end gap-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void handleRenameThread(thread.id, thread.title)}
                    className="rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteThread(thread.id)}
                    className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

export default ChatPage;



