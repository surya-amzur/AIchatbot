import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMe, login, logout, signup } from "../lib/api";
import type { ManualLoginPayload, ManualSignupPayload } from "../types";


export const authQueryKey = ["auth", "me"] as const;

export function useAuthQuery() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: getMe,
    retry: false,
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ManualLoginPayload) => login(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
    },
  });
}

export function useSignupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ManualSignupPayload) => signup(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
    },
  });
}
