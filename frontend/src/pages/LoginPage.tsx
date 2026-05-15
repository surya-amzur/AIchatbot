import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { apiClient, getChatThreads } from "../lib/api";
import { chatThreadsQueryKey } from "../hooks/useChat";
import { useLoginMutation, useSignupMutation } from "../hooks/useAuth";

declare global {
  interface Window {
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

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Missing VITE_GOOGLE_CLIENT_ID in frontend/.env.");
      return;
    }

    const scriptId = "google-identity-services";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initGoogle = () => {
      if (!window.google || !buttonRef.current) {
        setError("Unable to load Google Identity Services.");
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
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
          } catch {
            setError("Sign-in failed. Verify backend auth endpoint is running.");
          }
        },
      });

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 280,
      });
    };

    const tryInitGoogle = () => {
      if (window.google) {
        initGoogle();
        return;
      }

      // Under StrictMode/HMR, the script element may exist before it is fully loaded.
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (window.google) {
          window.clearInterval(timer);
          initGoogle();
          return;
        }
        if (attempts >= 20) {
          window.clearInterval(timer);
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
        tryInitGoogle();
      }
    }
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
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 px-6 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-md">
        {/* Header */}
        <div className="mb-8">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700">
            <span className="text-xl font-bold text-white">A</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Amzur AI Chat</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to continue to your chat workspace.</p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-8 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
              mode === "login" 
                ? "bg-white text-brand-600 shadow-sm" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
              mode === "signup" 
                ? "bg-white text-brand-600 shadow-sm" 
                : "text-slate-600 hover:text-slate-900"
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
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Work email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition shadow-sm"
              placeholder="name@amzur.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition shadow-sm"
              placeholder="Minimum 8 characters"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-brand-700 hover:to-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:from-brand-600 disabled:hover:to-brand-700 transition-all"
          >
            {isSubmitting ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-500">or continue with Google</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Google Button */}
        <div className="flex justify-center" ref={buttonRef} />

        {/* Error Message */}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default LoginPage;
