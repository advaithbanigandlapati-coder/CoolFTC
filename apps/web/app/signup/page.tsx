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
  const [pendingEmail, setPendingEmail] = useState("");

  function update(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function createOrg(userId: string) {
    const slug = form.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
    const { data: org, error: orgErr } = await supabase.from("organizations").insert({
      name: form.orgName, ftc_team_number: form.teamNumber || null,
      slug, created_by: userId,
    }).select("id").single();
    if (orgErr || !org) { setError("Account created but org setup failed. Try signing in."); setLoading(false); return; }
    const { error: memErr } = await supabase.from("org_members").insert({
      org_id: org.id, user_id: userId, role: "admin",
    });
    if (memErr) { setError("Account created but org link failed. Try signing in."); setLoading(false); return; }
    setLoading(false);
    router.push("/app");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      if (!form.email || !form.password || !form.displayName) { setError("Please fill in all fields."); return; }
      setError(""); setStep(2); return;
    }
    if (!form.orgName.trim()) { setError("Please enter a team/org name."); return; }
    setLoading(true); setError("");

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { display_name: form.displayName } },
    });
    if (signUpErr || !data.user) { setError(signUpErr?.message ?? "Sign up failed"); setLoading(false); return; }

    if (!data.session) {
      // Email confirmation required — store pending org in localStorage, show check-email screen
      localStorage.setItem("pendingOrg", JSON.stringify({
        name: form.orgName.trim(), teamNumber: form.teamNumber || null, userId: data.user.id,
      }));
      setLoading(false);
      setPendingEmail(form.email);
      setStep(3);
      return;
    }

    await createOrg(data.user.id);
  }

  // Step 3 = check your email
  if (step === 3) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="font-display text-5xl font-black text-white mb-1">COOL<span className="text-accent">FTC</span></div>
          </div>
          <div className="card p-6 space-y-4">
            <h1 className="font-display text-2xl font-black tracking-wide">CHECK YOUR EMAIL</h1>
            <p className="text-white/60 text-sm font-mono leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-white font-bold">{pendingEmail}</span>.{"\n\n"}
              Open the link, then come back and sign in. Your organization will be created automatically on first login.
            </p>
            <Link href="/login" className="btn-primary w-full justify-center block text-center">
              Go to Sign In →
            </Link>
          </div>
        </div>
      </div>
    );
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
