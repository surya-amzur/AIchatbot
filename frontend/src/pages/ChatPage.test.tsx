import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ChatPage from "./ChatPage";

const threadsData = {
  threads: [
    {
      id: "t1",
      title: "Project Sync",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      last_message: "Latest update",
    },
  ],
};

const historyData = {
  thread_id: "t1",
  messages: [
    {
      id: "m1",
      role: "user",
      content: "Hello team",
      created_at: "2026-05-01T00:00:00Z",
    },
    {
      id: "m2",
      role: "assistant",
      content: "Hi, how can I help?",
      created_at: "2026-05-01T00:00:01Z",
    },
  ],
};

vi.mock("../hooks/useAuth", () => ({
  useAuthQuery: () => ({
    data: { id: "u1", email: "employee@amzur.com", name: "Employee" },
    isError: false,
  }),
  useLogoutMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../hooks/useChat", () => ({
  useChatThreadsQuery: () => ({
    data: threadsData,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
  useChatHistoryQuery: () => ({
    data: historyData,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
  useSendMessageMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("ChatPage", () => {
  it("renders previously stored chats", () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Project Sync")).toBeInTheDocument();
    expect(screen.getByText("Hello team")).toBeInTheDocument();
    expect(screen.getByText("Hi, how can I help?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Chat" })).toBeInTheDocument();
  });
});
