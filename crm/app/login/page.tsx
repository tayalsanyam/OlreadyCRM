"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup/check")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && !d.hasAdmin) setSetupMode(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = setupMode ? "/api/setup" : "/api/auth/login";
      const body = setupMode
        ? { createAdmin: true, username, password }
        : { username, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error;
        setError(typeof err === "string" ? err : err?.message || JSON.stringify(err) || "Failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">
          Olready CRM
        </h1>
        {setupMode && (
          <>
            <p className="mb-4 rounded-lg bg-amber-500/20 p-2 text-center text-sm text-amber-400">
              First-time setup: Create admin account
            </p>
            <p className="mb-2 text-center">
              <button
                type="button"
                onClick={() => setSetupMode(false)}
                className="text-sm text-sky-400 hover:underline"
              >
                Already have an account? Sign in
              </button>
            </p>
          </>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="Enter username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Enter password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : setupMode
              ? "Create Admin"
              : "Sign in"}
          </button>
          {!setupMode && (
            <p className="mt-2 text-center text-sm text-slate-500">
              No account? Refresh page – setup mode appears when no admin exists.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
