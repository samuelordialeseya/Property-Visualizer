"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { updateUserProfile } from "@/hooks/useFirestore";

export default function Login() {
  const { login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getFriendlyErrorMessage = (err) => {
    const code = err?.code || "";
    const msg = err?.message || "";
    if (
      code === "auth/invalid-credential" ||
      code === "auth/user-not-found" ||
      code === "auth/wrong-password" ||
      msg.includes("auth/invalid-credential") ||
      msg.includes("auth/user-not-found") ||
      msg.includes("auth/wrong-password")
    ) {
      return "Incorrect email or password. Please check your credentials and try again.";
    }
    if (code === "auth/email-already-in-use" || msg.includes("auth/email-already-in-use")) {
      return "An account with this email already exists. Please sign in instead.";
    }
    if (code === "auth/weak-password" || msg.includes("auth/weak-password")) {
      return "Password is too weak. Please use at least 6 characters.";
    }
    if (code === "auth/invalid-email" || msg.includes("auth/invalid-email")) {
      return "Please enter a valid email address.";
    }
    if (code === "auth/too-many-requests" || msg.includes("auth/too-many-requests")) {
      return "Too many failed attempts. Please wait a few minutes before trying again.";
    }
    if (code === "auth/network-request-failed" || msg.includes("auth/network-request-failed")) {
      return "Network error. Please check your internet connection and try again.";
    }
    return "Failed to authenticate. Please check your credentials and try again.";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isSignUp) {
        const userCredential = await signup(email, password);
        if (userCredential?.user?.uid) {
          await updateUserProfile(userCredential.user.uid, {
            manager_name: name.trim(),
            default_currency: "PHP"
          });
        }
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-100 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-sm animate-scale-in">
        {/* Brand */}
        <div className="mb-8 text-center flex flex-col items-center animate-fade-down delay-100">
          <img
            src="/branding/logo-full.png"
            alt="Property Visualizer"
            className="h-28 w-auto max-w-[260px] object-contain select-none mb-3"
          />
          <p className="text-[13px] text-zinc-500">
            {isSignUp ? "Create your admin account" : "Admin dashboard — sign in to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] border border-zinc-200/70 animate-fade-up delay-150">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600 animate-fade-in">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-[0.08em] text-zinc-500">
                  FULL NAME
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--color-blue-600)] focus:bg-white"
                  placeholder="e.g. Juan dela Cruz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold tracking-[0.08em] text-zinc-500">
                EMAIL
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--color-blue-600)] focus:bg-white"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold tracking-[0.08em] text-zinc-500">
                PASSWORD
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-[var(--color-blue-600)] focus:bg-white"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-[var(--color-blue-600)] py-3 text-[14px] font-semibold text-white transition active:scale-[0.97] hover:bg-[var(--color-blue-700)] disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Authenticating…" : isSignUp ? "Create Account →" : "Sign In →"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              className="text-[13px] font-medium text-zinc-500 hover:text-[var(--color-blue-600)] transition"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
