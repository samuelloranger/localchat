# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Privacy-conscious people who want ChatGPT-like help (everyday Q&A, notes, brainstorming) without sending chats to the cloud. They use a personal phone (iOS or Android), often offline after models are downloaded.

## Product Purpose

LocalChat is a personal private assistant that downloads public GGUF models from Hugging Face and runs them fully on-device. Success means: install the app, download one small model, hold a multi-turn private chat with no network required for inference.

## Positioning

On-device Hugging Face GGUF chat with explicit device-fit gating (estimated RAM vs phone RAM) and no accounts, analytics, or cloud LLM fallback — not a thin wrapper around a hosted API.

## Operating Context

- Multi-conversation chat threads stored locally (SQLite)
- Models tab: browse/search public HF GGUFs, filter/sort, download/delete
- Inference via llama.cpp bindings (`llama.rn`) on a development/native build (not Expo Go)
- Settings: appearance (system/light/dark), language (system/EN/FR), storage, privacy copy
- Network is used only for Hub browse/download of public models (no API key in MVP)

## Capabilities and Constraints

**In product**
- Public HF Hub browse/download of GGUF chat models (no HF token in MVP; gated models out of scope)
- Device RAM fit check: unfit models remain listed but Download / load / send are disabled with a clear reason
- Streaming replies with stop; backgrounding stops generation
- EN + FR from system locale; missing strings fall back to English
- Working product name: LocalChat (App Store / Play name may change without changing product purpose)

**Out of MVP (explicit non-goals)**
- Cloud models, accounts, sync, voice, vision, RAG/attachments, widgets, share-sheet, custom fine-tunes
- Unbounded desktop-sized models as runnable defaults

**Open**
- Final public store name undecided (LocalChat is a placeholder)

## Brand Commitments

- Name in use: LocalChat (placeholder-friendly)
- Voice: calm, private, direct — privacy copy states that chats and models stay on device
- Mark/asset: speech-bubble + keyhole icon in `assets/images/` (teal `#0D9488` usage is documented in `design-system/MASTER.md`; visual system details belong in DESIGN.md when documented)

## Evidence on Hand

- Design spec: `docs/superpowers/specs/2026-08-01-localchat-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-01-localchat.md`
- Design tokens: `design-system/MASTER.md`
- Runnable Expo app under `app/` + `src/`
- HTML mockups: `preview/mockups/`
- Icons: `assets/images/icon.png`, `logo-512.png`, splash and Android adaptive assets
- No user research transcripts, store listings, or third-party testimonials — do not fabricate them

## Product Principles

1. **Privacy is the product** — after download, inference and chat history never leave the device.
2. **Honest device limits** — never pretend a model will run; show unfit options as disabled with RAM reasons.
3. **Public Hub, no gatekeeping identity** — no accounts and no required API key for the MVP path.
4. **Phone-first assistant** — multi-thread chat, stop generation, offline use after install.
5. **Bilingual from day one** — ship EN and FR; follow the system language by default.

## Accessibility & Inclusion

Follow platform defaults: Dynamic Type / system text scaling, VoiceOver and TalkBack, Reduce Motion. No additional product-mandated WCAG target beyond native platform expectations was established.
