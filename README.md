# LocalChat

Privacy-first on-device chat for iOS and Android. Download public GGUF models from Hugging Face (no API key) and run them locally with `llama.rn`.

## Requirements

- Bun
- Android Studio / Xcode for native builds
- **Not Expo Go** — `llama.rn` needs a development client

## Setup

```bash
bun install
bunx expo prebuild
bunx expo run:android   # or bunx expo run:ios
bun run start
```

## Scripts

| Script | Purpose |
|---|---|
| `bun run start` | Metro bundler |
| `bun run android` / `ios` | Native run |
| `bun run test` | Jest |
| `bun run typecheck` | TypeScript |

## Privacy

- No accounts, analytics, or cloud LLM APIs
- Hub network only for browsing/downloading public GGUFs
- Chats and models stay on device
