import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage";
import * as apiModule from "../lib/api";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.restoreAllMocks();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-google-client-id");
  });

  it("triggers chat history load after successful login", async () => {
    const postSpy = vi.spyOn(apiModule.apiClient, "post").mockResolvedValue({ data: { status: "ok" } });
    const threadsSpy = vi.spyOn(apiModule, "getChatThreads").mockResolvedValue({ threads: [] });

    let callback: ((response: { credential: string }) => void) | null = null;
    const existingScript = document.createElement("script");
    existingScript.id = "google-identity-services";
    document.head.appendChild(existingScript);

    (window as Window & { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (options: { callback: (response: { credential: string }) => void }) => {
            callback = options.callback;
          },
          renderButton: vi.fn(),
        },
      },
    };

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(callback).not.toBeNull();
    });

    if (!callback) {
      throw new Error("Google callback was not initialized.");
    }
    const loginCallback = callback as (response: { credential: string }) => Promise<void> | void;
    await loginCallback({ credential: "valid-token" });

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/api/auth/google/login", { credential: "valid-token" });
      expect(threadsSpy).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/chat", { replace: true });
    });
  });

  it("supports manual email and password login", async () => {
    const postSpy = vi.spyOn(apiModule.apiClient, "post").mockResolvedValue({ data: { status: "ok" } });
    const threadsSpy = vi.spyOn(apiModule, "getChatThreads").mockResolvedValue({ threads: [] });

    (window as Window & { google: unknown }).google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(),
        },
      },
    };

    const queryClient = new QueryClient();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("name@amzur.com"), {
      target: { value: "manual@amzur.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Minimum 8 characters"), {
      target: { value: "Password123" },
    });
    const form = container.querySelector("form");
    if (!form) {
      throw new Error("Expected login form to render.");
    }
    fireEvent.submit(form);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/api/auth/login", {
        email: "manual@amzur.com",
        password: "Password123",
      });
      expect(threadsSpy).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/chat", { replace: true });
    });
  });
});
