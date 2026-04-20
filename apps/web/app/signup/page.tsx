"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", teamNumber: "", orgName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }
    setLoading(true); setError("");
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { display_name: form.displayName } },
    });
    if (signUpErr || !data.user) { setError(signUpErr?.message ?? "Sign up failed"); setLoading(false); return; }

    const slug = form.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await supabase.from("organizations").insert({
      name: form.orgName, ftc_team_number: form.teamNumber || null,
      slug: `${slug}-${Date.now()}`, created_by: data.user.id,
    });
    window.location.href = "/app";
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-display text-5xl font-black text-white mb-1">COOL<span className="text-accent">FTC</span></div>
          <p className="text-white/40 text-sm font-mono">Create your scouting team</p>
        </div>
        <div className="card p-6">
          <div className="flex gap-1.5 mb-6">
            {[1,2].map((s) => <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-accent" : "bg-white/10"}`} />)}
          </div>
          <h1 className="font-display text-2xl font-black mb-5 tracking-wide">
            {step === 1 ? "YOUR ACCOUNT" : "YOUR TEAM"}
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 ? (<>
              <div>
                <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest">DISPLAY NAME</label>
                <input className="input" value={form.displayName} onChange={(e) => update("displayName", e.target.value)} placeholder="Your name" required />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest">EMAIL</label>
                <input className="input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@school.edu" required />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest">PASSWORD</label>
                <input className="input" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Min 8 characters" minLength={8} required />
              </div>
            </>) : (<>
              <div>
                <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest">TEAM / ORG NAME</label>
                <input className="input" value={form.orgName} onChange={(e) => update("orgName", e.target.value)} placeholder="Cool Name Pending" required />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-white/40 mb-1.5 tracking-widest">FTC TEAM NUMBER <span className="text-white/20">(optional)</span></label>
                <input className="input" value={form.teamNumber} onChange={(e) => update("teamNumber", e.target.value)} placeholder="30439" />
              </div>
            </>)}
            {error && <p className="text-ftc-red text-xs font-mono">{error}</p>}
            <button className="btn-primary w-full justify-center" disabled={loading}>
              {step === 1 ? "Next: Team Setup →" : loading ? "Creating…" : "Create Team →"}
            </button>
          </form>
          <p className="text-center text-sm text-white/30 mt-5">
            Have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
