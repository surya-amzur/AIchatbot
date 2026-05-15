import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteThread, generateImage, getChatThreads, getHistory, renameThread, sendMessageStream } from "../lib/api";
import type { Attachment } from "../types";


export const chatThreadsQueryKey = ["chat", "threads"] as const;

export function useChatThreadsQuery() {
  return useQuery({
    queryKey: chatThreadsQueryKey,
    queryFn: getChatThreads,
    staleTime: 5000,
  });
}

export function useChatHistoryQuery(threadId: string | null) {
  return useQuery({
    queryKey: ["chat", "history", threadId],
    queryFn: () => getHistory(threadId, { offset: 0, limit: 30 }),
    staleTime: 5000,
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      message: string;
      threadId: string | null;
      attachments: Attachment[];
      onChunk: (chunk: string) => void;
    }) => sendMessageStream(payload.message, payload.threadId, payload.attachments, payload.onChunk),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}

export function useRenameThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { threadId: string; title: string }) =>
      renameThread(payload.threadId, payload.title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}

export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (threadId: string) => deleteThread(threadId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}

export function useGenerateImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { prompt: string; threadId: string | null }) =>
      generateImage(payload.prompt, payload.threadId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}
