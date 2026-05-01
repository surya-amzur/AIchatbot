import axios from "axios";

import type {
  ChatHistoryResponse,
  ChatThreadsResponse,
  LoginSuccessResponse,
  ManualLoginPayload,
  ManualSignupPayload,
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

export async function getHistory(threadId: string): Promise<ChatHistoryResponse> {
  const response = await apiClient.get<ChatHistoryResponse>("/api/chat/history", {
    params: { thread_id: threadId },
  });
  return response.data;
}

export async function sendMessageStream(
  message: string,
  threadId: string | null,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const response = await fetch(`${apiClient.defaults.baseURL}/api/chat/send`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, thread_id: threadId }),
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
