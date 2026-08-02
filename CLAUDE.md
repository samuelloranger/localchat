# LocalChat

Privacy-first on-device chat for iOS and Android. Downloads public GGUF models from Hugging Face (no API key) and runs inference locally with `llama.rn`.

## Run (dev client required)

`llama.rn` does **not** work in Expo Go. Use a development build:

```bash
bun install
bunx expo prebuild
bunx expo run:android   # or: bunx expo run:ios (macOS + Xcode)
```

Then:

```bash
bun run start
```

## Scripts

- `bun run start` — Metro
- `bun run android` / `bun run ios` — native run
- `bun run test` — Jest
- `bun run typecheck` — `tsc --noEmit`

## Docs

- Design: `docs/superpowers/specs/2026-08-01-localchat-design.md`
- Plan: `docs/superpowers/plans/2026-08-01-localchat.md`
- Tokens: `design-system/MASTER.md`
