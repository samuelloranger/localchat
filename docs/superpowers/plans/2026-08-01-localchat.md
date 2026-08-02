# LocalChat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Expo iOS/Android app that downloads public GGUF models from Hugging Face (no API key) and runs private multi-turn chat on-device via `llama.rn`.

**Architecture:** Expo Router tabs (Chats / Models / Settings) + stack Chat screen. SQLite persists conversations, messages, and installed models. `ModelStore` talks to the public Hub HTTP API and writes files under app documents. `InferenceService` wraps `llama.rn` (`initLlama` / `completion` stream / `stopCompletion` / `release`). Theme tokens and EN/FR i18n match the approved design spec.

**Tech Stack:** Expo SDK 53+ (dev client), Expo Router, TypeScript, expo-sqlite, expo-file-system, llama.rn, @expo-google-fonts/lora + raleway, lucide-react-native, jest + @testing-library/react-native, i18n-js (or expo-localization + simple dict).

**Spec:** `docs/superpowers/specs/2026-08-01-localchat-design.md`  
**Design tokens:** `design-system/MASTER.md`

## Global Constraints

- Strictly local inference after download — no accounts, analytics, or cloud LLM APIs.
- No Hugging Face API token in MVP — public Hub only; gated models out of scope.
- Default Hub list filters to `.gguf` files with `size_bytes <= 2_147_483_648` (~2 GB).
- UI languages: EN + FR; missing key → English.
- Appearance: system / light / dark; primary teal `#0D9488`; fonts Lora + Raleway.
- Icons: Lucide vectors only — no emoji icons.
- Touch targets ≥ 44pt; motion 150–300ms; respect Reduce Motion.
- Working directory for all commands: `/home/samuelloranger/sites/localchat` (this repo only — never commit from `~/sites` root).
- Package manager: **Bun** (`bun install`, `bun run <script>`) unless an Expo template forces npm once — then switch scripts to Bun immediately after scaffold.
- Commits: small, conventional (`feat:`, `test:`, `chore:`); only when a task step says Commit.

---

## File map (create unless noted)

```
localchat/
├─ app/
│  ├─ _layout.tsx                 # Root: fonts, SQLiteProvider, theme, i18n
│  ├─ (tabs)/
│  │  ├─ _layout.tsx              # Tab bar Chats | Models | Settings
│  │  ├─ index.tsx                # Chats list
│  │  ├─ models.tsx               # Hub browse + installed
│  │  └─ settings.tsx
│  └─ chat/[id].tsx               # Thread + composer + stream
├─ src/
│  ├─ db/
│  │  ├─ schema.ts                # SQL DDL + DATABASE_VERSION
│  │  └─ migrate.ts               # migrateDbIfNeeded(db)
│  ├─ domain/
│  │  └─ types.ts                 # Conversation, Message, InstalledModel, HubGgufFile
│  ├─ services/
│  │  ├─ chatStore.ts
│  │  ├─ modelStore.ts
│  │  ├─ hfHub.ts                 # Public Hub HTTP client (no token)
│  │  ├─ downloadManager.ts       # Resumable file download
│  │  └─ inference.ts             # llama.rn wrapper
│  ├─ i18n/
│  │  ├─ index.ts
│  │  ├─ en.ts
│  │  └─ fr.ts
│  ├─ theme/
│  │  ├─ colors.ts
│  │  ├─ typography.ts
│  │  └─ ThemeProvider.tsx
│  └─ components/
│     ├─ EmptyState.tsx
│     ├─ MessageBubble.tsx
│     ├─ Composer.tsx
│     ├─ ModelRow.tsx
│     └─ ConfirmSheet.tsx
├─ __tests__/
│  ├─ chatStore.test.ts
│  ├─ modelStore.test.ts
│  ├─ hfHub.test.ts
│  ├─ downloadManager.test.ts
│  ├─ inference.test.ts
│  └─ i18n.test.ts
├─ app.json / app.config.ts
├─ package.json
└─ jest.config.js
```

---

### Task 1: Expo scaffold, theme, i18n shell

**Files:**
- Create: `package.json`, `app.json` / `app.config.ts`, `tsconfig.json`, `babel.config.js`, `jest.config.js`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/models.tsx`, `app/(tabs)/settings.tsx`, `src/theme/*`, `src/i18n/*`, `__tests__/i18n.test.ts`, `CLAUDE.md`
- Modify: (none — greenfield after design docs already committed)

**Interfaces:**
- Consumes: design tokens from `design-system/MASTER.md`
- Produces:
  - `t(key: string, opts?: Record<string, string | number>): string`
  - `useTheme(): { colors, scheme: 'light' | 'dark' }`
  - Expo app boots with three placeholder tabs

- [ ] **Step 1: Scaffold Expo app with typed routes**

```bash
cd /home/samuelloranger/sites/localchat
# If package.json already missing app code:
bunx create-expo-app@latest . --template tabs
# Keep existing docs/ and design-system/; resolve conflicts by keeping our docs.
bun install
```

Enable in `app.json`:

```json
{
  "expo": {
    "name": "LocalChat",
    "slug": "localchat",
    "scheme": "localchat",
    "experiments": { "typedRoutes": true },
    "plugins": [
      "expo-router",
      "expo-localization",
      [
        "llama.rn",
        {
          "enableEntitlements": true,
          "entitlementsProfile": "production",
          "forceCxx20": true,
          "enableOpenCL": true
        }
      ],
      [
        "expo-build-properties",
        {
          "ios": { "deploymentTarget": "15.1" },
          "android": { "minSdkVersion": 24 }
        }
      ]
    ]
  }
}
```

Install deps:

```bash
bun add expo-sqlite expo-file-system expo-localization i18n-js lucide-react-native \
  @expo-google-fonts/lora @expo-google-fonts/raleway expo-font expo-build-properties llama.rn
bun add -d jest @types/jest ts-jest @testing-library/react-native @testing-library/jest-native \
  react-test-renderer jest-expo
```

Note: Expo Go cannot load `llama.rn`. Document in `CLAUDE.md`: use `bunx expo prebuild` + `bunx expo run:ios` / `run:android` (dev client).

- [ ] **Step 2: Write failing i18n test**

```ts
// __tests__/i18n.test.ts
import { t, setLocale } from '../src/i18n'

test('falls back to English for missing FR key', () => {
  setLocale('fr')
  expect(t('test.onlyInEn')).toBe('English only')
})

test('returns FR when present', () => {
  setLocale('fr')
  expect(t('tabs.chats')).toBe('Discussions')
})
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
bun run test -- __tests__/i18n.test.ts
```

Expected: FAIL (module missing or key missing).

- [ ] **Step 4: Implement theme + i18n + tab shells**

`src/theme/colors.ts` — exact hex from spec (teal `#0D9488`, light/dark surfaces).  
`src/i18n/en.ts` / `fr.ts` — include at least: `tabs.chats`, `tabs.models`, `tabs.settings`, `chats.new`, `chats.empty`, `models.empty`, `settings.privacy`, `test.onlyInEn` (EN only).  
`src/i18n/index.ts` — `i18n-js` + `expo-localization`; `setLocale('system' | 'en' | 'fr')`; missing → EN.

Replace tab screens with titled placeholders using `t()` and theme colors. Wire fonts in root `_layout.tsx`.

- [ ] **Step 5: Run test — expect PASS**

```bash
bun run test -- __tests__/i18n.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Expo app with theme and i18n

EOF
)"
```

---

### Task 2: SQLite schema + ChatStore

**Files:**
- Create: `src/domain/types.ts`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/services/chatStore.ts`, `__tests__/chatStore.test.ts`
- Modify: `app/_layout.tsx` (wrap `SQLiteProvider` + `onInit={migrateDbIfNeeded}`)

**Interfaces:**
- Consumes: `SQLiteDatabase` from `expo-sqlite`
- Produces:
  - `migrateDbIfNeeded(db: SQLiteDatabase): Promise<void>`
  - `createConversation(db, { modelId: string, title?: string }): Promise<Conversation>`
  - `listConversations(db): Promise<Conversation[]>`
  - `deleteConversation(db, id: string): Promise<void>`
  - `getMessages(db, conversationId: string): Promise<Message[]>`
  - `appendMessage(db, msg: Omit<Message, 'id' | 'createdAt'> & { id?: string }): Promise<Message>`
  - `updateMessage(db, id: string, patch: Partial<Pick<Message, 'content' | 'status'>>): Promise<void>`
  - `setConversationTitle(db, id: string, title: string): Promise<void>`
  - `setConversationModel(db, id: string, modelId: string): Promise<void>`

```ts
// src/domain/types.ts (normative)
export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'complete' | 'streaming' | 'error'

export type Conversation = {
  id: string
  title: string
  modelId: string
  createdAt: number
  updatedAt: number
}

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
  status: MessageStatus
}

export type InstalledModel = {
  id: string
  repoId: string
  filename: string
  displayName: string
  sizeBytes: number
  localPath: string
  downloadedAt: number
  lastUsedAt: number | null
}

export type HubGgufFile = {
  repoId: string
  filename: string
  displayName: string
  sizeBytes: number
  sha?: string
}
```

- [ ] **Step 1: Write failing ChatStore tests**

```ts
// __tests__/chatStore.test.ts
import * as SQLite from 'expo-sqlite'
import { migrateDbIfNeeded } from '../src/db/migrate'
import * as chat from '../src/services/chatStore'

async function openMem() {
  const db = await SQLite.openDatabaseAsync(':memory:')
  await migrateDbIfNeeded(db)
  return db
}

test('createConversation then list', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'repo/file.gguf' })
  expect(c.title).toBeTruthy()
  const list = await chat.listConversations(db)
  expect(list).toHaveLength(1)
  expect(list[0].id).toBe(c.id)
})

test('appendMessage cascade delete', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'm' })
  await chat.appendMessage(db, {
    conversationId: c.id,
    role: 'user',
    content: 'hi',
    status: 'complete',
  })
  await chat.deleteConversation(db, c.id)
  expect(await chat.getMessages(db, c.id)).toHaveLength(0)
  expect(await chat.listConversations(db)).toHaveLength(0)
})

test('updateMessage streaming to complete', async () => {
  const db = await openMem()
  const c = await chat.createConversation(db, { modelId: 'm' })
  const m = await chat.appendMessage(db, {
    conversationId: c.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
  })
  await chat.updateMessage(db, m.id, { content: 'hello', status: 'complete' })
  const msgs = await chat.getMessages(db, c.id)
  expect(msgs[0].content).toBe('hello')
  expect(msgs[0].status).toBe('complete')
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test -- __tests__/chatStore.test.ts
```

- [ ] **Step 3: Implement schema + migrate + chatStore**

`schema.ts` DDL:

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE models (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  local_path TEXT NOT NULL,
  downloaded_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

Use `PRAGMA foreign_keys = ON;` and `user_version = 1`. IDs via `crypto.randomUUID()`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test -- __tests__/chatStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db src/domain src/services/chatStore.ts __tests__/chatStore.test.ts app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat: add SQLite schema and ChatStore

EOF
)"
```

---

### Task 3: Public HF Hub client + download manager + ModelStore

**Files:**
- Create: `src/services/hfHub.ts`, `src/services/downloadManager.ts`, `src/services/modelStore.ts`, `__tests__/hfHub.test.ts`, `__tests__/downloadManager.test.ts`, `__tests__/modelStore.test.ts`
- Modify: none required beyond exports

**Interfaces:**
- Consumes: `fetch`, `expo-file-system`, ChatStore types `InstalledModel` / `HubGgufFile`
- Produces:
  - `searchGgufModels(query: string, opts?: { maxBytes?: number }): Promise<HubGgufFile[]>`
  - `listRepoGgufFiles(repoId: string, opts?: { maxBytes?: number }): Promise<HubGgufFile[]>`
  - `downloadUrl(repoId: string, filename: string): string` → `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`
  - `downloadGguf(params: { url: string; destPath: string; expectedBytes?: number; onProgress?: (p: number) => void; signal?: AbortSignal }): Promise<void>` — supports resume via existing partial file length + `Range` header when server allows
  - `listInstalled(db): Promise<InstalledModel[]>`
  - `recordInstalled(db, model: InstalledModel): Promise<void>`
  - `removeInstalled(db, id: string): Promise<void>` — deletes DB row + file (and `.partial` if any)
  - `modelFilePath(modelId: string): string` — under `FileSystem.documentDirectory + 'models/'`
  - **Never** send `Authorization` headers

- [ ] **Step 1: Write failing Hub + download tests**

```ts
// __tests__/hfHub.test.ts
import { downloadUrl, filterGgufEntries } from '../src/services/hfHub'

test('downloadUrl is public resolve URL without token query', () => {
  const u = downloadUrl('owner/repo', 'model-Q4_K_M.gguf')
  expect(u).toBe('https://huggingface.co/owner/repo/resolve/main/model-Q4_K_M.gguf')
  expect(u.includes('token')).toBe(false)
})

test('filterGgufEntries drops non-gguf and oversized', () => {
  const out = filterGgufEntries('o/r', [
    { path: 'a-Q4_K_M.gguf', size: 1_000_000, type: 'file' },
    { path: 'readme.md', size: 100, type: 'file' },
    { path: 'huge.gguf', size: 3_000_000_000, type: 'file' },
  ], 2_147_483_648)
  expect(out).toHaveLength(1)
  expect(out[0].filename).toBe('a-Q4_K_M.gguf')
})
```

```ts
// __tests__/downloadManager.test.ts
import { nextRangeHeader } from '../src/services/downloadManager'

test('resume uses Range from partial byte length', () => {
  expect(nextRangeHeader(0)).toBeUndefined()
  expect(nextRangeHeader(4096)).toBe('bytes=4096-')
})
```

Mock `fetch` in `modelStore` integration test: search returns one file → `recordInstalled` after fake download writes path.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test -- __tests__/hfHub.test.ts __tests__/downloadManager.test.ts
```

- [ ] **Step 3: Implement hfHub + downloadManager + modelStore**

Hub endpoints (no auth):

```ts
// search example
const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=20&full=true`
// tree example
const tree = `https://huggingface.co/api/models/${repoId}/tree/main`
```

Parse tree JSON; keep `type === 'file' && path.endsWith('.gguf') && size <= maxBytes`.  
Seed curated default query when `query` empty: e.g. search `GGUF Q4_K_M` or a hard-coded allowlist of 3–5 known small instruct repos (Phi-3 mini, Qwen2.5-0.5B, Gemma-2-2B Q4, TinyLlama) — pick repos that are public and have ≤2GB GGUFs; document chosen IDs in a `CURATED_REPOS` constant in `hfHub.ts`.

Download: write to `destPath + '.partial'`, rename on success; on resume `stat` partial and set `Range`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test -- __tests__/hfHub.test.ts __tests__/downloadManager.test.ts __tests__/modelStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/hfHub.ts src/services/downloadManager.ts src/services/modelStore.ts __tests__/
git commit -m "$(cat <<'EOF'
feat: add public HF Hub client and ModelStore downloads

EOF
)"
```

---

### Task 4: InferenceService (`llama.rn` wrapper)

**Files:**
- Create: `src/services/inference.ts`, `__tests__/inference.test.ts`
- Modify: none

**Interfaces:**
- Consumes: `initLlama`, `LlamaContext` from `llama.rn`; `Message` type
- Produces:
  - `loadModel(localPath: string, onProgress?: (n: number) => void): Promise<void>`
  - `unloadModel(): Promise<void>`
  - `isLoaded(): boolean`
  - `loadedPath(): string | null`
  - `completeChat(params: { messages: { role: MessageRole; content: string }[]; onToken: (token: string) => void; signal?: { aborted: boolean } }): Promise<{ text: string }>`
  - `stop(): Promise<void>` — calls `context.stopCompletion()`
  - On `AppState` → `background`: callers must `stop()` then optionally `unloadModel()` (wiring in Task 7)

```ts
// Implementation sketch (normative API)
import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn'

let ctx: LlamaContext | null = null
let path: string | null = null

export async function loadModel(localPath: string, onProgress?: (n: number) => void) {
  if (path === localPath && ctx) return
  await unloadModel()
  ctx = await initLlama(
    { model: localPath.startsWith('file://') ? localPath : `file://${localPath}`, n_ctx: 2048, n_gpu_layers: 99, use_mmap: true },
    onProgress,
  )
  path = localPath
}

export async function completeChat({ messages, onToken }) {
  if (!ctx) throw new Error('NO_MODEL_LOADED')
  const result = await ctx.completion(
    {
      messages,
      n_predict: 512,
      temperature: 0.7,
      stop: ['</s>', '<|end|>', '<|im_end|>', '<|eot_id|>'],
    },
    (data) => onToken(data.token),
  )
  return { text: result.content || result.text }
}

export async function stop() {
  if (ctx) await ctx.stopCompletion()
}

export async function unloadModel() {
  if (ctx) {
    await ctx.release()
    ctx = null
    path = null
  }
}
```

- [ ] **Step 1: Write failing unit tests with mocked `llama.rn`**

```ts
// __tests__/inference.test.ts
jest.mock('llama.rn', () => {
  const completion = jest.fn(async (_p, cb) => {
    cb({ token: 'Hi' })
    return { text: 'Hi', content: 'Hi', tokens_predicted: 1, timings: {} }
  })
  const stopCompletion = jest.fn(async () => {})
  const release = jest.fn(async () => {})
  return {
    initLlama: jest.fn(async () => ({ completion, stopCompletion, release, gpu: false })),
    releaseAllLlama: jest.fn(async () => {}),
  }
})

import * as inference from '../src/services/inference'
import { initLlama } from 'llama.rn'

test('completeChat streams tokens after loadModel', async () => {
  await inference.loadModel('/tmp/m.gguf')
  expect(initLlama).toHaveBeenCalled()
  const tokens: string[] = []
  const { text } = await inference.completeChat({
    messages: [{ role: 'user', content: 'hi' }],
    onToken: (t) => tokens.push(t),
  })
  expect(tokens.join('')).toContain('Hi')
  expect(text).toBe('Hi')
})

test('completeChat without load throws NO_MODEL_LOADED', async () => {
  await inference.unloadModel()
  await expect(
    inference.completeChat({ messages: [], onToken: () => {} }),
  ).rejects.toThrow('NO_MODEL_LOADED')
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun run test -- __tests__/inference.test.ts
```

- [ ] **Step 3: Implement `src/services/inference.ts` as above**

- [ ] **Step 4: Run — expect PASS**

```bash
bun run test -- __tests__/inference.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/inference.ts __tests__/inference.test.ts
git commit -m "$(cat <<'EOF'
feat: wrap llama.rn load, stream, and stop

EOF
)"
```

---

### Task 5: Models screen (browse / download / delete)

**Files:**
- Create: `src/components/ModelRow.tsx`, `src/components/EmptyState.tsx`, `src/components/ConfirmSheet.tsx`
- Modify: `app/(tabs)/models.tsx`, `src/i18n/en.ts`, `src/i18n/fr.ts`

**Interfaces:**
- Consumes: `searchGgufModels`, `downloadGguf`, `listInstalled`, `recordInstalled`, `removeInstalled`, `modelFilePath`
- Produces: working Models tab UI

- [ ] **Step 1: Implement Models screen behavior**

- On focus: `listInstalled(db)` + if online `searchGgufModels('')` (curated); cache last Hub JSON in AsyncStorage key `hub.cache.v1` for offline empty-state recovery.
- Search `TextInput` debounced 300ms → `searchGgufModels(q)`.
- Row: displayName, size (MB), Download / progress % / Resume / Delete.
- Download path: `modelFilePath(`${repoId}__${filename}`)` with id = `${repoId}/${filename}`.
- Delete: `ConfirmSheet`; call `removeInstalled`; if download in progress, abort first.
- Empty installed + empty Hub offline → `EmptyState` with privacy copy + Retry.
- No HF token UI.

- [ ] **Step 2: Manual smoke (dev client)**

```bash
bunx expo prebuild --clean
bunx expo run:android   # or run:ios on Mac
```

Expected: Models tab lists curated GGUFs; tapping Download shows progress (use a tiny GGUF if available).

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/models.tsx src/components src/i18n
git commit -m "$(cat <<'EOF'
feat: Models tab browse and download public GGUFs

EOF
)"
```

---

### Task 6: Chats list screen

**Files:**
- Modify: `app/(tabs)/index.tsx`, `src/i18n/en.ts`, `src/i18n/fr.ts`
- Create: (reuse `EmptyState`, `ConfirmSheet`)

**Interfaces:**
- Consumes: `listConversations`, `createConversation`, `deleteConversation`, `listInstalled`
- Produces: navigates to `/chat/[id]`

- [ ] **Step 1: Implement Chats list**

- FlatList of conversations sorted by `updatedAt` desc.
- FAB / header button “New chat”: if `listInstalled` empty → disable + CTA navigate to Models; else `createConversation` with `modelId = installed[0].id` (or last-used), then `router.push(`/chat/${id}`)`.
- Swipeable or long-press delete → ConfirmSheet → `deleteConversation`.
- Empty state: localized copy + button to Models when no models; “New chat” when models exist.

- [ ] **Step 2: Manual smoke** — create/delete thread without opening inference.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/index.tsx src/i18n
git commit -m "$(cat <<'EOF'
feat: Chats list with new and delete flows

EOF
)"
```

---

### Task 7: Chat screen (stream + stop + model chip)

**Files:**
- Create: `app/chat/[id].tsx`, `src/components/MessageBubble.tsx`, `src/components/Composer.tsx`
- Modify: `app/_layout.tsx` (register stack for `chat/[id]` outside tabs), `src/i18n/*`

**Interfaces:**
- Consumes: ChatStore, ModelStore, InferenceService
- Produces: end-to-end local chat

- [ ] **Step 1: Implement send + stream pipeline**

On send:

1. If no `modelId` or file missing → disable send / alert to Models.
2. `appendMessage` user (`complete`).
3. If conversation title is default (“New chat” / FR equiv) → `setConversationTitle` from first ~40 chars of user text.
4. `appendMessage` assistant (`streaming`, content `''`).
5. `loadModel(localPath)` if needed; bump `lastUsedAt`.
6. Build messages array: last N complete messages (fit budget: keep while rough `chars/4 < 1500` tokens, always include latest user).
7. `completeChat` → on each token `updateMessage` content append (throttle UI writes to ~50ms with `requestAnimationFrame` or local React state + single DB write on finish).
8. On success → status `complete`; on throw → status `error`, keep partial, show Retry.
9. Stop button → `inference.stop()`.
10. `AppState` listener: on `background`/`inactive` → `inference.stop()`.

Model chip in header: ActionSheet of `listInstalled`; `setConversationModel`; show non-blocking banner “Next reply uses {name}” (not a chat message).

Composer: multiline, send, disabled when no model / while streaming (except Stop visible).

- [ ] **Step 2: Manual E2E**

Download a small GGUF → New chat → send “Say hi in one word” → see stream → airplane mode → still replies → Stop mid-gen keeps partial.

- [ ] **Step 3: Commit**

```bash
git add app/chat src/components app/_layout.tsx src/i18n
git commit -m "$(cat <<'EOF'
feat: streaming Chat screen with on-device inference

EOF
)"
```

---

### Task 8: Settings + privacy + storage

**Files:**
- Modify: `app/(tabs)/settings.tsx`, `src/i18n/*`
- Create: `src/services/preferences.ts` (AsyncStorage: `appearance`, `locale`)

**Interfaces:**
- Consumes: theme setter, `setLocale`, `listInstalled` for storage sum
- Produces: Settings screen complete

- [ ] **Step 1: Implement Settings**

- Appearance: System / Light / Dark → persist + ThemeProvider.
- Language: System / English / Français.
- Storage: sum `sizeBytes` of installed models; button to open Models.
- About / Privacy: static text — no accounts; Hub used only to download; chats and models stay on device; no telemetry.

- [ ] **Step 2: Test locale switch updates tab labels without restart**

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/settings.tsx src/services/preferences.ts src/i18n
git commit -m "$(cat <<'EOF'
feat: Settings for theme, locale, storage, privacy

EOF
)"
```

---

### Task 9: Polish, CLAUDE.md commands, verification pass

**Files:**
- Modify: `CLAUDE.md`, `package.json` scripts, any rough edges from Tasks 5–8
- Create: `README.md` (run instructions: prebuild, run:ios/android, no Expo Go, no HF token)

- [ ] **Step 1: Add scripts**

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "expo lint"
  }
}
```

- [ ] **Step 2: Run full verification**

```bash
bun run test
bun run typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 3: Spec checklist (manual)**

- [ ] No API key anywhere in UI or network headers  
- [ ] EN + FR strings for all user-visible copy  
- [ ] Light + dark contrast OK  
- [ ] Empty / error / resume download paths work  
- [ ] Background stops generation  

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md package.json
git commit -m "$(cat <<'EOF'
chore: document LocalChat run and verify scripts

EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| Expo + llama.rn + SQLite | 1, 2, 4 |
| Public HF download, no API key | 3, 5 |
| Multi-conversation list | 6 |
| Streaming chat + stop | 7 |
| Model switch mid-thread (UI notice) | 7 |
| Settings theme / locale / privacy / storage | 8 |
| EN/FR + fallback | 1, 8 |
| Errors: offline Hub, resume, OOM, background stop | 3, 5, 7 |
| Design tokens teal / Lora / Raleway | 1 |
| Out of MVP: cloud, voice, RAG, gated models | Not implemented (intentional) |

## Placeholder scan

No TBD/TODO steps. Signatures named consistently: `listInstalled`, `loadModel`, `completeChat`, `stop`, `downloadGguf`.

## Type consistency

- `modelId` on conversations = `InstalledModel.id` = `` `${repoId}/${filename}` ``
- Message `status`: `complete` | `streaming` | `error` only
- Hub type: `HubGgufFile`; DB type: `InstalledModel`
