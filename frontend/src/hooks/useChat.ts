import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getChatThreads, getHistory, sendMessageStream } from "../lib/api";


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
    queryFn: () => getHistory(threadId as string),
    enabled: Boolean(threadId),
    staleTime: 5000,
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      message: string;
      threadId: string | null;
      onChunk: (chunk: string) => void;
    }) => sendMessageStream(payload.message, payload.threadId, payload.onChunk),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}
