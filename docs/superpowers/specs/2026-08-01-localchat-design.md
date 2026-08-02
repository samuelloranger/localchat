# LocalChat — on-device Hugging Face chat (React Native)

**Status:** Design approved  
**Date:** 2026-08-01  
**Working name:** LocalChat (rename allowed before first release)

## Summary

LocalChat is a privacy-first personal assistant for iOS and Android. Users download small chat-ready **GGUF** models from Hugging Face inside the app, then chat fully on-device. No accounts, no analytics, no cloud LLM APIs. After a model is downloaded, inference never leaves the device.

Stack: **Expo** (dev client) + **`llama.rn`** (llama.cpp) + **SQLite** + Hugging Face Hub for browse/download only.

## Goals

- Everyday private Q&A / notes / brainstorming (ChatGPT-shaped UX, local-only).
- In-app download of curated GGUF models from Hugging Face.
- Multiple conversation threads with streaming replies and stop.
- Light / dark / system appearance; EN + FR from system locale at launch.
- Recoverable handling for offline Hub, failed downloads, OOM, and mid-stream errors.

## Non-goals (MVP)

- Cloud models, accounts, sync, or any network use after model download (except optional Hub re-browse).
- Voice input/output, vision/multimodal, RAG, file attachments.
- Widgets, share-sheet integration, custom fine-tuning, arbitrary Transformers checkpoints that are not GGUF.
- Unbounded model sizes (MVP targets phone-friendly quants; see size cap below).

## Product decisions (locked)

| Decision | Choice |
|---|---|
| Primary job | Personal private assistant |
| Model delivery | Download in-app from Hugging Face |
| Chats | Multiple conversations (thread list) |
| Privacy | Strictly local after download |
| Locale | System language; ship EN + FR |
| Runtime | Approach 1 — Expo + `llama.rn` + GGUF |

## Architecture

```
Expo (RN) · iOS + Android
├─ Screens: Conversations · Chat · Models · Settings
├─ ModelStore   — HF Hub API + local file management
├─ Inference    — llama.rn (GGUF load / stream / stop / unload)
├─ ChatStore    — SQLite conversations + messages
└─ i18n         — EN/FR; fallback to EN for missing keys
```

- **Expo with a development client** (required for `llama.rn` native code).
- **Network** only for Hugging Face browse/download.
- **Model files** stored under app documents; metadata in SQLite.
- **Curated / filtered Hub queries**: GGUF chat models under a soft size cap (default **~2 GB** / prefer ≤~3B-class quants) so typical phones remain usable. Exact allowlist/query strategy is an implementation detail but must exclude obviously desktop-sized files from the default list.

## UI & navigation

### Navigation

- Bottom tabs: **Chats** | **Models** | **Settings**.
- Chat thread is a stack push from Chats; back restores list scroll position.
- **Expo Router** (file-based; typed routes on React Navigation).

### Screens

| Screen | Behavior |
|---|---|
| **Chats** | Thread list; title = first user message or localized “New chat”; swipe-to-delete with confirm; primary “New chat” disabled until ≥1 model installed. |
| **Chat** | Bubbles; streaming token append; stop generation; header model chip to switch among installed models for that thread. |
| **Models** | Curated HF GGUF list with search + size filter; download progress; installed section with delete; empty state explains privacy + first download. |
| **Settings** | Appearance (system/light/dark); language (system/EN/FR); storage used by models; About/privacy (data never leaves device). |

### Visual direction

Aligned with ui-ux-pro-max (**Minimal & Direct**, calm assistant), tuned away from “AI startup purple”:

| Token | Value |
|---|---|
| Accent / primary | Teal `#0D9488` |
| On primary | `#FFFFFF` |
| Background (light) | `#FAFAF8` |
| Foreground (light) | `#14201F` |
| Muted surface (light) | `#F0F4F3` |
| Border (light) | `#D5DEDC` |
| Background (dark) | `#0C1211` |
| Foreground (dark) | `#E8EEEC` |
| Destructive | `#DC2626` |
| Heading font | Lora |
| Body font | Raleway |
| Icons | Lucide (or equivalent vector) — no emoji as icons |

Motion: 150–300ms press feedback; streaming caret; respect reduced motion. Touch targets ≥44pt with ≥8pt gaps. Composer respects keyboard + safe area.

Canonical tokens also live in `design-system/MASTER.md` (must match this table).

## Data model

### SQLite

**`conversations`**

- `id`, `title`, `model_id`, `created_at`, `updated_at`

**`messages`**

- `id`, `conversation_id`, `role` (`user` | `assistant` | `system`), `content`, `created_at`, `status` (`complete` | `streaming` | `error`)

**`models`**

- `id` (stable key from HF repo + filename), `repo_id`, `filename`, `display_name`, `size_bytes`, `local_path`, `downloaded_at`, `last_used_at`

### Key flows

1. **First launch** → empty Chats → CTA to Models → download GGUF → New chat unlocks.
2. **Send** → persist user message → ensure model loaded → stream into assistant row → mark `complete`; set title from first user message when still default.
3. **Switch model mid-thread** → history retained; next reply uses new model; show a non-chat UI notice (not a fake assistant message).
4. **Delete model** → block during active stream; warn if conversations reference it; threads stay readable; send disabled until another model is selected.
5. **HF browse** → Hub API with GGUF + size filters; resumable download into app documents.

**Context window:** last N messages fitting a token budget derived from the loaded model. No RAG or attachments in MVP.

## Errors & edge cases

| Situation | Behavior |
|---|---|
| Offline while browsing Hub | Show last cached list if present; else offline empty state + retry |
| Download fail / interrupt | Keep partial file; Resume; delete partial on cancel |
| Disk full | Fail early with storage guidance; link to Models to free space |
| OOM / load failure | Surface error; suggest smaller quant; unload cleanly |
| Mid-stream generation error | Mark message `error`; keep partial text; offer Retry |
| App backgrounded mid-gen | Stop generation; keep partial reply |
| No model installed | Composer disabled; primary CTA → Models |
| Delete conversation | Confirm; cascade-delete messages |
| Missing i18n key | Fall back to English |

## Testing

- **Unit:** ChatStore, ModelStore download state machine, i18n fallbacks.
- **Component:** empty states, composer enablement rules, message list keys/rendering.
- **Manual:** download a small GGUF on simulator/device; stream a multi-turn chat offline; kill mid-download and resume; toggle EN↔FR and light/dark.

**Success criterion:** Install → download one small model → hold a private multi-turn chat with no network.

## Repo layout (initial)

```
localchat/
├─ docs/superpowers/specs/2026-08-01-localchat-design.md
├─ design-system/MASTER.md
├─ app/                    # Expo Router screens (to be created)
├─ src/
│  ├─ services/            # ChatStore, ModelStore, Inference
│  ├─ db/                  # SQLite schema + migrations
│  ├─ i18n/
│  └─ theme/
└─ package.json
```

File layout under `app/` follows Expo Router conventions; implementation plan will list concrete routes.

## Open rename

Product name **LocalChat** is a placeholder. Final App Store / Play name can change without redesigning architecture.
