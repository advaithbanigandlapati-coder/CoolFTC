"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    // Hard navigation (not router.push) — gives middleware a fresh request
    // with the auth cookies properly set, avoiding the RSC cache race.
    window.location.href = "/app";
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-display text-5xl font-black text-white mb-1">
            COOL<span className="text-accent">FTC</span>
          </div>
          <p className="text-white/40 text-sm font-mono">FTC Scouting Intelligence Platform</p>
        </div>
        <div className="card p-6">
          <h1 className="font-display text-2xl font-black mb-5 tracking-wide">SIGN IN</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest uppercase">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team30439.com" required />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest uppercase">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <p className="text-ftc-red text-xs font-mono">{error}</p>}
            <button className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>
          <p className="text-center text-sm text-white/30 mt-5">
            No account?{" "}
            <Link href="/signup" className="text-accent hover:underline">Create your team</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
