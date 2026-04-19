"use client";

const ENTRIES = [
  {
    version:"v1.2.0", date:"2025-06-15", summary:"Forge engine + War Room realtime sync",
    changes:[
      {type:"✨",label:"New","text":"The Forge Monte Carlo engine — run 1,000+ match simulations with seeded PRNG for reproducibility"},
      {type:"✨",label:"New","text":"War Room drag-and-drop alliance board syncs across all team devices in real time via Supabase"},
      {type:"✨",label:"New","text":"RP probability calculations for movement, goal, and pattern ranking points"},
      {type:"⚡",label:"Improved","text":"ARIA context assembler now includes Forge simulation results and War Room state as context blocks"},
      {type:"⚡",label:"Improved","text":"Hive Mind live feed panel now shows scout name and exact timestamp per update"},
    ]
  },
  {
    version:"v1.1.0", date:"2025-05-28", summary:"ARIA synergy engine + module system",
    changes:[
      {type:"✨",label:"New","text":"ARIA streaming responses — answers stream in real time instead of waiting for full completion"},
      {type:"✨",label:"New","text":"Module toggle bar — activate Scout Data, Live Stats, Forge Sim, War Room, My Robot, or Season context before asking ARIA"},
      {type:"✨",label:"New","text":"Suggested prompts on empty ARIA screen for common strategy questions"},
      {type:"🐛",label:"Fixed","text":"ARIAModule import path resolved (was causing TypeScript compilation error in assembler.ts)"},
      {type:"⚡",label:"Improved","text":"System prompt rebuilt per-request from active module context blocks — ARIA now truly sees your live data"},
    ]
  },
  {
    version:"v1.0.0", date:"2025-05-10", summary:"Initial launch — full scouting suite",
    changes:[
      {type:"✨",label:"New","text":"Match scouting form with DECODE 2025–26 game structure (auto, teleop, endgame scoring)"},
      {type:"✨",label:"New","text":"Hive Mind — stat lead dashboard showing all scout entries with real-time Supabase sync"},
      {type:"✨",label:"New","text":"14-table Supabase schema with RLS, role-based access, and offline write queue"},
      {type:"✨",label:"New","text":"Team creation flow with org membership and role system (admin, scout, analyst, viewer)"},
      {type:"✨",label:"New","text":"Live Intel — OPR, rankings, and match stats pulled from FTCScout GraphQL"},
      {type:"📊",label:"Data","text":"FTC Events API integration for event schedule and team data sync"},
    ]
  },
];

const typeColor: Record<string,string> = {
  "✨":"text-ftc-amber","⚡":"text-ftc-blue","🐛":"text-ftc-red","📊":"text-ftc-green",
};

export default function ChangelogPage() {
  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-8">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">CHANGELOG</p>
        <h1 className="font-display text-4xl font-black tracking-wide">RELEASE NOTES</h1>
        <p className="text-white/40 text-sm mt-1">What's new in CoolFTC — built by Team #30439</p>
      </div>

      <div className="relative">
        <div className="absolute left-[7px] top-3 bottom-3 w-px bg-white/[0.065]" />
        <div className="space-y-8">
          {ENTRIES.map((entry, ei) => (
            <div key={entry.version} className="relative pl-8">
              <div className={`absolute left-0 top-2 w-3.5 h-3.5 rounded-full border-2 border-accent ${ei===0?"bg-accent":"bg-bg"}`} />
              <div className="card p-5">
                <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                  <span className="font-display text-2xl font-black tracking-wide text-accent">{entry.version}</span>
                  <span className="font-mono text-xs text-white/30">{entry.date}</span>
                  {ei===0 && <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">LATEST</span>}
                </div>
                <p className="text-white/60 text-sm mb-4 italic">{entry.summary}</p>
                <div className="space-y-2.5">
                  {entry.changes.map((c,ci)=>(
                    <div key={ci} className="flex gap-3 text-sm">
                      <span className="text-base flex-shrink-0">{c.type}</span>
                      <span className={`font-mono text-[10px] font-medium flex-shrink-0 mt-0.5 tracking-wider ${typeColor[c.type]??"text-white/40"}`}>{c.label}</span>
                      <span className="text-white/70 leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
