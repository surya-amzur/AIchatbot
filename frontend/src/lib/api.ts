import axios from "axios";

import type {
  Attachment,
  ChatHistoryResponse,
  ChatThreadsResponse,
  ImageGenerateResponse,
  ImageRuleValidationResponse,
  LoginSuccessResponse,
  ManualLoginPayload,
  ManualSignupPayload,
  Nl2SqlQueryResponse,
  Nl2SqlSchemaResponse,
  RagQueryResponse,
  RagUploadResponse,
  TabularQueryResponse,
  TabularUploadExcelResponse,
  TabularUploadGSheetResponse,
  User,
} from "../types";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  withCredentials: true,
});

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>("/api/auth/me");
  return response.data;
}

export async function signup(payload: ManualSignupPayload): Promise<LoginSuccessResponse> {
  const response = await apiClient.post<LoginSuccessResponse>("/api/auth/signup", payload);
  return response.data;
}

export async function login(payload: ManualLoginPayload): Promise<LoginSuccessResponse> {
  const response = await apiClient.post<LoginSuccessResponse>("/api/auth/login", payload);
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}

export async function getChatThreads(): Promise<ChatThreadsResponse> {
  const response = await apiClient.get<ChatThreadsResponse>("/api/chat/threads");
  return response.data;
}

export async function getHistory(
  threadId?: string | null,
  pagination?: { offset?: number; limit?: number },
): Promise<ChatHistoryResponse> {
  const params: { thread_id?: string; offset?: number; limit?: number } = {};
  if (threadId) {
    params.thread_id = threadId;
  }
  if (pagination?.offset !== undefined) {
    params.offset = pagination.offset;
  }
  if (pagination?.limit !== undefined) {
    params.limit = pagination.limit;
  }

  const response = await apiClient.get<ChatHistoryResponse>("/api/chat/history", {
    params,
  });
  return response.data;
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  await apiClient.patch(`/api/chat/threads/${threadId}`, { title });
}

export async function deleteThread(threadId: string): Promise<void> {
  await apiClient.delete(`/api/chat/threads/${threadId}`);
}

export async function uploadAttachment(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<{ attachment: Attachment }>("/api/chat/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.attachment;
}

export async function uploadAttachments(files: File[]): Promise<Attachment[]> {
  if (!files.length) {
    return [];
  }
  const uploaded = await Promise.all(files.map((file) => uploadAttachment(file)));
  return uploaded;
}

export async function generateImage(prompt: string, threadId: string | null): Promise<ImageGenerateResponse> {
  const response = await apiClient.post<ImageGenerateResponse>("/api/chat/generate-image", {
    prompt,
    thread_id: threadId,
  });
  return response.data;
}

export async function uploadPdfForRag(file: File, threadId: string | null): Promise<RagUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (threadId) {
    formData.append("thread_id", threadId);
  }
  const response = await apiClient.post<RagUploadResponse>("/api/rag/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function queryRag(
  question: string,
  threadId: string | null,
  documentIds: string[],
  topK = 4,
): Promise<RagQueryResponse> {
  const response = await apiClient.post<RagQueryResponse>("/api/rag/query", {
    question,
    thread_id: threadId,
    document_ids: documentIds,
    top_k: topK,
  });
  return response.data;
}

export async function getNl2SqlSchema(): Promise<Nl2SqlSchemaResponse> {
  const response = await apiClient.get<Nl2SqlSchemaResponse>("/api/nl2sql/schema");
  return response.data;
}

export async function queryNl2Sql(
  question: string,
  maxRows?: number,
): Promise<Nl2SqlQueryResponse> {
  const response = await apiClient.post<Nl2SqlQueryResponse>("/api/nl2sql/query", {
    question,
    max_rows: maxRows,
  });
  return response.data;
}

export async function uploadExcelForTabularQa(
  file: File,
  threadId: string | null,
): Promise<TabularUploadExcelResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (threadId) {
    formData.append("thread_id", threadId);
  }
  const response = await apiClient.post<TabularUploadExcelResponse>("/api/tabular/upload-excel", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function uploadGSheetForTabularQa(
  spreadsheet: string,
  worksheet: string | null,
  threadId: string | null,
): Promise<TabularUploadGSheetResponse> {
  const response = await apiClient.post<TabularUploadGSheetResponse>("/api/tabular/upload-gsheet", {
    spreadsheet,
    worksheet: worksheet || null,
    thread_id: threadId,
  });
  return response.data;
}

export async function queryTabularQa(
  question: string,
  threadId: string | null,
  documentIds: string[],
  topK = 6,
): Promise<TabularQueryResponse> {
  const response = await apiClient.post<TabularQueryResponse>("/api/tabular/query", {
    question,
    thread_id: threadId,
    document_ids: documentIds,
    top_k: topK,
  });
  return response.data;
}

export async function validateImageRules(
  file: File,
  rulesText: string,
  threadId: string | null,
): Promise<ImageRuleValidationResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("rules_text", rulesText);
  if (threadId) {
    formData.append("thread_id", threadId);
  }
  const response = await apiClient.post<ImageRuleValidationResponse>("/api/image-rules/validate", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function sendMessageStream(
  message: string,
  threadId: string | null,
  attachments: Attachment[],
  onChunk: (chunk: string) => void,
): Promise<void> {
  const response = await fetch(`${apiClient.defaults.baseURL}/api/chat/send`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, thread_id: threadId, attachments }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Unable to stream chat response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    pending += decoder.decode(value, { stream: true });
    const events = pending.split("\n\n");
    pending = events.pop() ?? "";

    for (const event of events) {
      const line = event
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      if (!line) {
        continue;
      }
      const data = line.slice(6);
      if (data === "[DONE]") {
        return;
      }
      onChunk(data);
    }
  }
}
