# CoolFTC — FTC Intelligence Platform
### Built by Team #30439 Cool Name Pending · DECODE 2025–26
### v2.1 — Shared Platform · BYOK · Agentic ARIA · The Courier

Complete scouting and strategy platform for competitive FTC teams. One Turborepo monorepo runs the Next.js web app and the Expo mobile app, backed by a single Supabase deployment.

---

## Feature Matrix

| Module | Web | Mobile | Notes |
|---|---|---|---|
| 🖥️ Hive Mind | ✅ | — | Multi-scout realtime view for stat leads (desktop-only) |
| ⚡ ARIA | ✅ | ✅ | Agentic Claude + extended thinking + RAG + conversation memory + BYOK |
| 🔮 The Forge | ✅ | ✅ | Monte Carlo 1k-iter simulator with variance bands |
| 🏰 War Room | ✅ | ✅ | Drag-drop alliance board + DNP list + PDF export + snapshots |
| ◎ Live Intel | ✅ | ✅ | Schedule, countdown, scores, push notifications |
| ▣ Scout Suite | ✅ | ✅ | Match / Pit / Quick tabs — all three on both platforms |
| ◈ Analytics | ✅ | ✅ | Radar, OPR timeline, compat matrix, field heatmap |
| ▤ Notes | ✅ | ✅ | Tags, quick-tag chips, notebook mode, realtime, audio + photo attachments |
| ◐ Season Hub | ✅ | ✅ | Worlds tracker, rival watchlist, season meta, cross-event OPR |
| 🌍 Teams | ✅ | — | Global FTC team search with season stats and watchlist |
| ◪ The Courier | ✅ | ✅ | AI-generated event newspaper — quals/elim/daily/spotlight/hot-takes |
| 📋 Changelog | ✅ | ✅ | Platform release notes, ARIA-generated entries |
| ⚙ Settings | ✅ | ✅ | Team management, BYOK, FTC sync, members invite/roles |
| ⬡ QR Sync | — | ✅ | Real QR code sharing of offline scouting entries between phones |

---

## What's New in v2.1 (beyond v2)

- **The Courier**: full AI-generated event newspaper with 5 edition types, streaming generation, archive, copy/print/delete
- **BYOK encryption**: AES-256-GCM (upgraded from plain base64)
- **FTC data sync API**: `/api/ftc-sync` wired to Settings → Event → Sync button
- **Members management API**: `/api/org/members` with invite / role / remove + last-admin protection
- **Migration 005**: `awards`, `qualification_points`, `ranking_snapshots`, `courier_schedules`, Supabase Storage buckets (`pit-photos`, `robot-photos`, `audio-notes`) with RLS
- **Mobile parity**: scout page now has Match / Pit / Quick tabs
- **Real QR codes**: `react-native-qrcode-svg` replacing the ASCII placeholder
- **TypeScript config**: base + per-app + per-package `tsconfig.json` (none shipped before)
- **Build hygiene**: `.gitignore`, `.env.example` at root + per-app, `postcss.config.js` for Tailwind
- **Assets**: icon/splash/adaptive/notification PNGs, favicon.ico, og.png

---

## Supabase Setup (5 migrations + seed)

Run in order via Supabase SQL Editor. **Order matters** — 002 depends on 001's tables, etc.

1. `supabase/migrations/001_initial_schema.sql` — core tables, RLS, enums, courier_editions
2. `supabase/migrations/002_rag_and_ratelimit.sql` — pgvector, embeddings, ARIA rate limits
3. `supabase/migrations/003_byok_memory_pitscouting.sql` — BYOK columns, conversation memory, pit scouting, rivals
4. `supabase/migrations/004_analytics_push_qr.sql` — field heatmap positions, push tokens, QR sync sessions, compat matrix cache
5. `supabase/migrations/005_awards_quals_storage_courier.sql` — awards, qualification_points, ranking_snapshots, courier_schedules, **Storage buckets with RLS** (pit-photos, robot-photos, audio-notes)
6. `supabase/seed.sql` — 20 realistic DECODE-era test teams + the `2025-DECODE-TEST` event

**Before running 002**: enable the `vector` extension in Database → Extensions.

**Storage buckets**: migration 005 creates the three buckets automatically via `storage.buckets` inserts. No dashboard click required.

---

## ARIA Architecture — Agentic + RAG + Memory

```
User message
    ↓
Load conversation history (aria_conversations)
    ↓
RAG retrieval (pgvector — top-8 scouting + top-6 match entries)
    ↓
Claude claude-sonnet-4-20250514
  + thinking: enabled (8k budget)
  + tools: get_live_standings, get_team_profile,
           get_match_history, search_teams, run_forge_simulation
    ↓
Agentic loop: tool calls until answer is complete
    ↓
Stream response via SSE to client
    ↓
Save messages (auto-summarize after 12 turns)
```

**Key resolution order:**
1. `api_mode = 'own_key'` → AES-256-GCM decrypt org's key → use it
2. `api_mode = 'trial'` → use team-owned `ANTHROPIC_API_KEY` → decrement 100k/21-day budget
3. `api_mode = 'locked'` → return 402, redirect to Settings → API

---

## The Courier

AI-generated FTC event newspaper. Five edition types:

- **Quals Recap** — post-qualification summary, top 5 performers, elim preview
- **Elim Recap** — elimination rounds narrative, alliance performance, key matches
- **Daily Wrap** — end-of-day hits: top performer, biggest OPR swing, one to watch
- **Robot Spotlight** — deep feature on one standout robot (requires team number)
- **Hot Takes** — opinionated takes on trends and bold predictions

Editions stream in real-time via SSE, persist to `courier_editions`, and are browsable in an archive. Delete requires admin role.

Optional auto-generation: insert into `courier_schedules` (cadence: `once`, `daily`, `after_quals`, `after_elims`). A cron job polling `next_run_at` can be added later; the schema is ready.

---

## Mobile APK Build

```bash
cd apps/mobile
npm install -g eas-cli
eas login                 # free Expo account
eas build:configure
eas build --platform android --profile preview
# → shareable .apk download link in ~15 min
```

For internal distribution, share the EAS link directly. No Play Store account needed for sideloading.

---

## Environment Variables

Copy `.env.example` → `.env.local` at the repo root (or per-app) and fill in:

```bash
# ── Supabase (shared — one instance for all teams) ──
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── Anthropic (team-owned key — funds trials) ──
ANTHROPIC_API_KEY=sk-ant-...

# ── BYOK encryption (required for org-owned keys) ──
# Generate: openssl rand -base64 32
BYOK_ENCRYPTION_KEY=...

# ── OpenAI (optional — RAG embeddings) ──
OPENAI_API_KEY=sk-...

# ── FTC APIs ──
FTC_API_KEY=your-ftc-username
FTC_API_SECRET=your-ftc-secret

# ── Mobile ──
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_BASE_URL=https://your-app.vercel.app
```

---

## Launch Flow (condensed)

1. **Supabase**: new project → enable `vector` extension → run migrations 001 → 005 → `seed.sql`
2. **Vars**: generate `BYOK_ENCRYPTION_KEY` (`openssl rand -base64 32`), grab Supabase keys, Anthropic key, FTC API creds
3. **Vercel**: import GitHub repo → Root Directory `apps/web`, Build Command `cd ../.. && turbo build --filter=web` → paste env vars → deploy
4. **Mobile**: `cd apps/mobile && cp .env.example .env.local` → fill in → `npx expo start` → scan QR with Expo Go (or build APK)
5. **First user**: sign up on web → auto-creates org with you as admin → Settings → Event → paste event key → click "Sync event data" → Members → invite scouts by email

Full launch guide: open `coolfTC_launch.html` in a browser.

---

MIT License · Team #30439 Cool Name Pending
