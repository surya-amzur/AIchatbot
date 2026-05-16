import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { apiClient, getChatThreads } from "../lib/api";
import { chatThreadsQueryKey } from "../hooks/useChat";
import { useLoginMutation, useSignupMutation } from "../hooks/useAuth";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

declare global {
  interface Window {
    __amzurGoogleClientInitialized?: string;
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              type?: "standard" | "icon";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (!isGoogleLoading) {
      return;
    }

    // If Google flow is canceled or stalls, clear the loader automatically.
    const timer = window.setTimeout(() => {
      setIsGoogleLoading(false);
    }, 20000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isGoogleLoading]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Missing VITE_GOOGLE_CLIENT_ID in frontend/.env.");
      return;
    }

    const scriptId = "google-identity-services";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    let pollTimer: number | null = null;
    let didInitInThisEffect = false;

    const initGoogle = () => {
      if (didInitInThisEffect) {
        return;
      }
      if (!window.google || !buttonRef.current) {
        setError("Unable to load Google Identity Services.");
        return;
      }

      // Avoid repeated initialize() warnings in StrictMode/HMR.
      if (window.__amzurGoogleClientInitialized !== clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            setIsGoogleLoading(true);
            try {
              setError("");
              await apiClient.post("/api/auth/google/login", {
                credential: response.credential,
              });
              await queryClient.prefetchQuery({
                queryKey: chatThreadsQueryKey,
                queryFn: getChatThreads,
              });
              navigate("/chat", { replace: true });
            } catch (error) {
              if (axios.isAxiosError(error)) {
                const detail = error.response?.data?.detail;
                const backendMessage =
                  typeof detail?.message === "string"
                    ? detail.message
                    : typeof error.response?.data?.message === "string"
                      ? error.response.data.message
                      : "";
                if (backendMessage) {
                  setError(`Sign-in failed: ${backendMessage}`);
                } else {
                  setError(`Sign-in failed: HTTP ${error.response?.status ?? "error"}`);
                }
              } else {
                const message = error instanceof Error ? error.message : "Sign-in failed.";
                setError(`Sign-in failed: ${message}`);
              }
              setIsGoogleLoading(false);
            }
          },
        });
        window.__amzurGoogleClientInitialized = clientId;
      }

      buttonRef.current.innerHTML = "";
      try {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 280,
        });
      } catch {
        setError("Google Sign-In failed to render. Check that localhost:5173 is allowed in the OAuth client origins.");
      }

      didInitInThisEffect = true;
    };

    const tryInitGoogle = () => {
      if (window.google) {
        initGoogle();
        return;
      }

      // Under StrictMode/HMR, the script element may exist before it is fully loaded.
      let attempts = 0;
      pollTimer = window.setInterval(() => {
        attempts += 1;
        if (window.google) {
          if (pollTimer) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          initGoogle();
          return;
        }
        if (attempts >= 20) {
          if (pollTimer) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          setError("Unable to load Google Identity Services.");
        }
      }, 150);
    };

    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.id = scriptId;
      script.async = true;
      script.defer = true;
      script.onload = tryInitGoogle;
      script.onerror = () => setError("Failed to load Google Identity Services script.");
      document.head.appendChild(script);
    } else {
      if (window.google) {
        initGoogle();
      } else {
        script.addEventListener("load", tryInitGoogle, { once: true });
      }
    }

    return () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [navigate]);

  const handleManualSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      if (mode === "signup") {
        await signupMutation.mutateAsync({
          email: email.trim(),
          name: name.trim(),
          password,
        });
      } else {
        await loginMutation.mutateAsync({
          email: email.trim(),
          password,
        });
      }
      await queryClient.prefetchQuery({
        queryKey: chatThreadsQueryKey,
        queryFn: getChatThreads,
      });
      navigate("/chat", { replace: true });
    } catch (error) {
      const fallback =
        mode === "signup" ? "Sign-up failed. Check your details." : "Login failed. Check your credentials.";

      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        const backendMessage =
          typeof detail?.message === "string"
            ? detail.message
            : typeof error.response?.data?.message === "string"
              ? error.response.data.message
              : "";

        if (mode === "signup" && detail?.error === "user_exists") {
          setError("Account already exists. Please switch to Login.");
          return;
        }

        if (backendMessage) {
          setError(backendMessage);
          return;
        }
      }

      setError(fallback);
    }
  };

  const isSubmitting = loginMutation.isPending || signupMutation.isPending;

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(53,87,230,0.10),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(27,43,96,0.12),_transparent_35%),var(--color-canvas)] px-4 py-10">
      <Card className="w-full max-w-md p-8 text-center">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Amzur Workspace</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Enterprise AI operations hub for chat, research, and analytics.</p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-8 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
              mode === "login" 
                ? "bg-white text-[var(--color-primary-600)] shadow-sm" 
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
              mode === "signup" 
                ? "bg-white text-[var(--color-primary-600)] shadow-sm" 
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form className="space-y-4 text-left" onSubmit={handleManualSubmit}>
          {mode === "signup" ? (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition shadow-sm"
                placeholder="Your name"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] transition shadow-sm"
              placeholder="name@amzur.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-200)] transition shadow-sm"
              placeholder="Minimum 8 characters"
            />
          </label>

          <Button
            type="submit"
            disabled={isSubmitting}
            variant="primary"
            className="w-full"
          >
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </Button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-500">or continue with Google</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Google Button */}
        <div className="relative flex justify-center">
          <div
            className="w-full max-w-[280px]"
            onClickCapture={() => {
              if (!isGoogleLoading) {
                setError("");
                setIsGoogleLoading(true);
              }
            }}
          >
            <div ref={buttonRef} />
          </div>

          {isGoogleLoading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/75 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-primary-500)] border-t-transparent" />
                <span className="text-xs font-medium text-slate-700">Signing in...</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Error Message */}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : null}
      </Card>
    </main>
  );
}

export default LoginPage;
