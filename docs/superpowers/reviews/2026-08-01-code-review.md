# LocalChat — Code Review & Fix Backlog

**Date:** 2026-08-01
**Reviewed at:** working tree on `main` (commit `f5fd093` + untracked/uncommitted work)
**Baseline state:** `bun run typecheck` clean, `bun run test` = 6 suites / 12 tests passing.

This document is written for the Cursor agent to execute. Each item is self-contained:
what's wrong, where, why it matters, and what "done" looks like. Work top-down —
P0 items are correctness/data-loss/store-rejection class; P1 are user-visible
breakage; P2 are quality and polish.

Nothing in here requires changing the architecture. Do not refactor beyond the
scope of an item.

---

## P0 — Must fix before any real device testing

### P0-1. Resumed downloads produce corrupt GGUF files

**File:** `src/services/downloadManager.ts:59-101`

`downloadGguf` reads the size of an existing `.partial` file, builds a
`Range: bytes=N-` header, and passes it to `FileSystem.createDownloadResumable(url,
partialPath, { headers: { Range } }, callback)`.

`createDownloadResumable` **truncates and writes from byte 0** of the destination
file. It does not append. So when the server honours the Range request and returns
only the tail of the file, that tail is written over the start of `.partial`, and
the result is renamed to `destPath` and recorded as an installed model. The model
is silently corrupt and `initLlama` will fail (or crash) on load.

The progress math at line 72-74 (`existingBytes + progress.totalBytesWritten`)
compounds the illusion that resume works.

**Fix:** use Expo's real resume mechanism, not a hand-rolled Range header.
`createDownloadResumable` returns a resumable whose `savable()` yields
`{ url, fileUri, options, resumeData }`. Persist that JSON next to the partial
(e.g. `${destPath}.resume.json`), and on a subsequent call rehydrate with
`new FileSystem.DownloadResumable(...)` / `FileSystem.createDownloadResumable(url,
fileUri, options, callback, resumeData)` and call `resumeAsync()` instead of
`downloadAsync()`.

If resume data is missing or `resumeAsync()` rejects, delete the `.partial` and
restart the download from scratch — a slow restart is correct; a corrupt model is not.

**Done when:**
- No manual `Range` header is constructed for the real (non-seam) download path.
- Interrupting a download and re-invoking it produces a byte-identical file to an
  uninterrupted download (assert in a test with the seam, and verify once manually
  on device).
- `nextRangeHeader` is either deleted or kept only for the test seam, with its
  test updated to match reality.

### P0-2. No integrity check before a download is promoted to an installed model

**Files:** `src/services/downloadManager.ts:100-102`, `src/services/modelStore.ts:102-120`

The `.partial` → `destPath` rename is unconditional. A truncated download (network
drop mid-stream, server 200 on a Range request, disk full) is recorded in the
`models` table as a complete install. The user then sees a model that fails to load
with no explanation and no way to repair it short of deleting.

**Fix:** before renaming, stat the `.partial` and compare against `expectedBytes`
when it is known. On mismatch, throw a typed error (`DOWNLOAD_INCOMPLETE`) and
leave the partial in place for a retry. Additionally, read the first 4 bytes and
assert the GGUF magic (`0x47 0x47 0x55 0x46`, ASCII `GGUF`) — a cheap guard that
catches HTML error pages saved as `.gguf`, which is what an HF rate-limit or a
gated-repo redirect actually returns.

**Done when:** a test feeds the seam a short/garbage file and `downloadGguf`
rejects without creating `destPath` and without writing a `models` row.

### P0-3. `crypto.randomUUID()` is not guaranteed to exist on Hermes

**File:** `src/services/chatStore.ts:5-7`

`globalThis.crypto.randomUUID()` passes tests because Jest runs on Node. On React
Native 0.86 / Hermes the `crypto` global is not part of the standard runtime — this
is a plausible hard crash the first time a user taps "New chat" on device, and the
test suite cannot catch it.

**Fix:** use `randomUUID()` from `expo-crypto` (add the dependency; it is an
Expo-managed module and works in the dev client). Keep `newId()` as the single
choke point so nothing else needs to change.

**Done when:** `chatStore` has no reference to `globalThis.crypto`, and the existing
`chatStore` tests still pass (mock `expo-crypto` in the Jest setup if needed).

### P0-4. Model files live in `documentDirectory` — iCloud backup and App Store rejection risk

**File:** `src/services/modelStore.ts:36-40`

On iOS, `FileSystem.documentDirectory` is backed up to iCloud. Multi-hundred-megabyte
GGUF files are re-downloadable content; backing them up violates Apple's Data Storage
Guidelines and is a common review rejection. It also silently eats the user's iCloud quota.

**Fix:** store models under a location excluded from backup. Simplest correct option
in Expo: keep them in an app-support/cache-adjacent directory that is not backed up,
or set the `NSURLIsExcludedFromBackupKey` attribute on the models directory. Do **not**
use `cacheDirectory` — iOS may evict it under storage pressure and delete a model the
user deliberately downloaded.

**Also:** migrate existing installs. On first launch after the change, move any file
referenced by `models.local_path` to the new directory and update the row, or — since
there are no production users yet — bump `DATABASE_VERSION`, drop stale rows whose
`local_path` no longer resolves, and let the user re-download.

**Done when:** new downloads land outside the backed-up Documents tree, and
`listInstalled` never returns a row whose `local_path` does not exist on disk.

---

## P1 — User-visible breakage

### P1-1. The keyboard covers the composer

**File:** `app/chat/[id].tsx:183-217`

The chat screen is a plain `View` with a `FlatList` and a `Composer`. There is no
`KeyboardAvoidingView` and no keyboard-aware inset. On iOS the composer is hidden
behind the keyboard as soon as the user taps the input — the app's primary
interaction is unusable.

**Fix:** wrap the screen in `KeyboardAvoidingView` (`behavior="padding"` on iOS,
`undefined`/`height` on Android with `android:windowSoftInputMode=adjustResize`),
and account for the header height via `useHeaderHeight()`. Respect safe-area insets
with `react-native-safe-area-context` (already a dependency).

**Done when:** with the keyboard open on both platforms, the composer input and the
send button are fully visible and the last message is not obscured.

### P1-2. The message list does not scroll to the newest message

**File:** `app/chat/[id].tsx:190-206`

Nothing scrolls the `FlatList`. During streaming the assistant's reply grows below
the fold and the user watches a static screen.

**Fix:** invert the list (`inverted` + reverse the data array) — the standard chat
solution, which keeps the newest message pinned for free and makes keyboard handling
easier. If inverting fights the empty state, the alternative is a `ref` +
`scrollToEnd({ animated: true })` on message append and on each streaming flush,
throttled, and suppressed while the user has scrolled up.

**Done when:** sending a message pins the view to the bottom, and streamed tokens
keep the newest text on screen without the user scrolling.

### P1-3. The "Retry" action on a failed message does nothing

**File:** `app/chat/[id].tsx:197-203`

The retry `Pressable` calls `send()`. `send()` reads `draft`, which is empty at that
point (it was cleared at line 111), hits `if (!text) return` at line 107, and exits
silently. Retry is dead code from the user's point of view.

**Fix:** extract the generation half of `send()` into
`runCompletion(conversationId, assistantMessageId, promptMessages)`. `send()` becomes
"persist user message → create assistant placeholder → runCompletion". Retry becomes
"reset the existing errored assistant message to `streaming` with empty content →
runCompletion with the same history". Do not append a second user message on retry.

**Done when:** tapping Retry on an errored message regenerates in place, and the
conversation does not gain a duplicate user turn.

### P1-4. Changing the language does not update already-mounted screens

**Files:** `src/i18n/index.ts:19-29`, `app/(tabs)/settings.tsx:74,96`, `app/(tabs)/_layout.tsx`

`t()` is a plain function reading module-level state. `setLocale` mutates
`i18n.locale` but nothing re-renders. Settings works around this with a
`const [, bump] = useState(0)` hack that only re-renders Settings itself — the tab
bar labels, the Chats screen, and the Models screen keep the old language until they
are remounted.

**Fix:** make the locale reactive. Add a `LocaleProvider` (or extend `ThemeProvider`
into a single `AppProviders`) holding the resolved locale in state, expose
`useTranslation()` returning a `t` bound to that state, and have `setLocale` go
through the provider. Screens consume `useTranslation()` instead of importing `t`
directly. Tab titles in `app/(tabs)/_layout.tsx` must read from the hook so they
re-render too.

Keep the bare `t` export only for non-React call sites, if any remain.

**Done when:** switching EN ↔ FR in Settings updates the tab bar, the Chats screen
header, and the Models screen immediately, with no navigation required. Delete the
`bump` hack.

### P1-5. A failed model download gives the user no feedback

**File:** `app/(tabs)/models.tsx:102-104`

```ts
} catch {
  // keep partial for resume
}
```

Every failure — offline, 404, gated repo, disk full, integrity failure from P0-2 —
is swallowed. The progress bar disappears and the row returns to "Download". The
user has no idea whether anything happened or what to do.

**Fix:** hold per-model error state and render an inline message on the row
(`ModelRow` already has room under the subtitle) with a Retry affordance. Add i18n
keys for at least: network unavailable, model unavailable/not found, not enough
storage, download incomplete. Map the typed errors from P0-2 onto them; fall back to
a generic failure string.

**Done when:** killing the network mid-download produces a visible, localised error
on the row plus a working Retry, in both EN and FR.

### P1-6. Starting a download silently cancels the one already in flight

**File:** `app/(tabs)/models.tsx:88-90`

`abortRef` is a single `AbortController` for the whole screen. Tapping Download on a
second model aborts the first with no warning, no message, and no visual trace — the
first row's progress just vanishes.

**Fix:** decide the policy and make it explicit. Recommended: keep one download at a
time (models are large; parallel downloads on cellular are hostile), but *enforce* it
in the UI — disable Download on every other row while one is active, rather than
cancelling. If concurrency is wanted instead, key the controllers by model id and let
each row cancel only itself.

**Done when:** it is impossible to destroy an in-flight download by accident, and the
disabled/active state is visible on the rows.

### P1-7. Leaving the chat screen mid-stream leaves generation running

**File:** `app/chat/[id].tsx:95-102`

Generation is stopped on `AppState` background/inactive, but not on unmount. Navigate
back to the chat list while a reply is streaming and inference keeps burning CPU and
battery, writing to SQLite for a screen that no longer exists, and setting state on an
unmounted component.

**Fix:** add a cleanup that calls `inference.stop()` when the screen unmounts (or use
`useFocusEffect`'s cleanup so it also fires on navigation away, not just unmount).
Guard the post-await state setters with a mounted ref so no `setState` runs after
teardown.

**Done when:** backing out mid-stream halts generation, and the partial reply is
persisted with a sensible status.

### P1-8. The Models list header mislabels the available section

**File:** `app/(tabs)/models.tsx:147-162`

One `ListHeaderComponent` renders a single label — `installed.length ? "Installed" :
"Available"` — above a flat array that concatenates installed models *and* hub
results. Once anything is installed, every downloadable model appears under a heading
that says "Installed".

**Fix:** use section headers. Either switch to `SectionList` with two sections, or
inject header rows into the data array and render them in `renderItem`. Hide a
section entirely when it is empty.

**Done when:** installed and available models sit under their own correct, localised
headings, and neither heading renders when its section is empty.

### P1-9. "New chat" on an installed model row does not start a chat

**File:** `app/(tabs)/models.tsx:170-171`

The primary action on an installed model is labelled `t('chats.new')` but calls
`router.push('/(tabs)')`, which merely switches to the Chats tab. The user taps
"New chat" and lands on a list.

**Fix:** create a conversation bound to that specific model
(`chatStore.createConversation(db, { modelId: m.id, title: t('chats.new') })`) and
navigate to `/chat/${id}`. This is also the only path that lets the user pick which
model a new conversation uses — worth keeping.

**Done when:** the action creates a conversation using that model and opens it.

---

## P2 — Quality, robustness, polish

### P2-1. Context-window budgeting is a guess that can overflow

**Files:** `app/chat/[id].tsx:27-39`, `src/services/inference.ts:29,54`

`buildContext` budgets 1500 "tokens" estimated at `content.length / 4`, against a
hardcoded `n_ctx: 2048` with `n_predict: 512`. 1500 + 512 = 2012 leaves 36 tokens of
slack for the chat template, the system prompt, and BPE variance — and `length / 4`
under-counts badly for French (accented characters) and for code. Overflow means a
truncated or failed generation.

**Fix:** derive the budget instead of hardcoding it: `promptBudget = n_ctx -
n_predict - safetyMargin`, with a margin of at least 128. Use `llama.rn`'s
tokenizer (`ctx.tokenize`) for the actual count rather than `length / 4` — it is
cheap relative to generation. Keep `n_ctx` in one place and share it between
`inference.ts` and the caller.

### P2-2. Hub search is a serial N+1 and can take tens of seconds

**File:** `src/services/hfHub.ts:86-102`

For each of up to 20 search hits, a tree listing is fetched **sequentially** inside a
`for` loop, each awaiting the previous. On mobile latency that is easily 10–20s for a
single keystroke's debounce to resolve.

**Fix:** `Promise.all` the tree listings (the empty-query path at lines 74-83 already
does this correctly — mirror it), cap concurrency at ~6, and cap the number of repos
inspected at ~8 rather than 20. Also pass the search `AbortSignal` through `fetch` so
a superseded query is cancelled instead of racing the newer one.

### P2-3. `n_gpu_layers: 99` is applied unconditionally

**File:** `src/services/inference.ts:30`

Offloading all layers is right on iOS/Metal and on Adreno with the OpenCL build, but
on devices where GPU init fails this can fail the load or fall back with a long stall.

**Fix:** make it configurable and add a graceful degradation: on load failure with
GPU layers > 0, retry once with `n_gpu_layers: 0` before surfacing an error. Log
which path succeeded so the failure mode is diagnosable from a user report.

### P2-4. Theme and locale flash on cold start

**File:** `app/_layout.tsx:31-41,67-79`

`BootstrapPrefs` renders `children` immediately and applies the persisted appearance
and locale in an effect. On a dark-mode device with an explicit "light" preference
(or vice versa) the first frame is wrong, then snaps.

**Fix:** hold the splash screen until preferences resolve — gate on both `loaded`
(fonts) and a `prefsLoaded` flag before rendering the tree and calling
`SplashScreen.hideAsync()`.

While in this file: `SplashScreen.hideAsync()` at line 63 is a floating promise —
`void` it with a `.catch()`, since it rejects if the splash is already hidden. And
the `useEffect(() => { if (error) throw error })` at 57-59 is an unusual way to reach
the error boundary; prefer rendering a fallback, or at minimum comment why.

### P2-5. SQLite is written every 50 ms during streaming

**File:** `app/chat/[id].tsx:143-158`

Each flush issues an `UPDATE messages SET content = ?` with the full accumulated
text. Over a 500-token reply that is dozens of writes of a growing string, on the
JS thread, competing with inference.

**Fix:** keep the 50 ms cadence for the in-memory `setMessages` (the UI needs it),
but persist far less often — every ~750 ms plus a guaranteed final write in the
`finally`. Crash-recovery granularity of under a second is plenty.

### P2-6. Accessibility gaps

**Files:** `app/(tabs)/index.tsx:85-100`, `app/chat/[id].tsx:74-90`,
`src/components/MessageBubble.tsx`

- Conversation rows are `Pressable` with no `accessibilityRole="button"` and no
  `accessibilityLabel`; the delete action is long-press only and invisible to
  assistive tech. Add an explicit label and an `accessibilityActions` entry for delete.
- The header model-switcher (`chat/[id].tsx`) has no `accessibilityLabel` explaining
  that tapping cycles models, and no `accessibilityHint`. It is also a poor
  affordance generally — consider a picker/menu instead of tap-to-cycle.
- Message text is not `selectable`; there is no way to copy a reply. Add
  `selectable` on the `Text` and a long-press "Copy" action.
- Placeholder text uses `colors.border` (`#D5DEDC` on `#FAFAF8`) as its colour in
  `Composer.tsx:36` and `models.tsx:119` — roughly 1.4:1 contrast, far below the
  4.5:1 minimum. Add a dedicated `mutedForeground` token to `src/theme/colors.ts`
  and use it for placeholders and secondary text.

### P2-7. Settings reports modelled storage, not actual storage

**File:** `app/(tabs)/settings.tsx:82-83`

Storage used is summed from `models.size_bytes` — the size the hub *claimed*. It
misses `.partial` files from abandoned downloads, which can be gigabytes, and drifts
from reality if a file is missing.

**Fix:** stat the models directory. Also add a "clear incomplete downloads" action
and a "delete all data" action — both are expected in a privacy-first app and both
are cheap here.

### P2-8. Test seam in `downloadGguf` diverges from the real path

**File:** `src/services/downloadManager.ts:29-48`

The seam branch skips the destination-directory creation that the real branch does
at lines 51-57, and it will need to skip the P0-1 resume logic and the P0-2
verification too. The two paths are drifting, so the tests increasingly validate code
that does not ship.

**Fix:** restructure so the seam injects only the *transport* (a function that
fetches bytes to a path), with directory creation, resume bookkeeping, verification,
and the rename living in shared code that both paths execute.

### P2-9. Unremoved abort listener

**File:** `src/services/downloadManager.ts:85-93`

The `abort` listener is registered `{ once: true }` but is never removed when the
download completes normally, so the signal retains a reference to the resumable for
the lifetime of the controller.

**Fix:** remove the listener in a `finally`.

### P2-10. Schema hardening

**File:** `src/db/schema.ts`

- `messages.role` and `messages.status` are free-form `TEXT`. Add
  `CHECK (role IN ('user','assistant','system'))` and
  `CHECK (status IN ('complete','streaming','error'))` so a bug cannot write a value
  the TypeScript union claims is impossible.
- Add `UNIQUE` on `models.local_path`.
- Add an index on `conversations(updated_at DESC)` — the Chats list orders by it on
  every focus.
- There is no migration path yet beyond `current === 0`. Before shipping, add the
  `while (current < DATABASE_VERSION)` step ladder so v1 → v2 is possible; right now a
  bump to 2 would silently skip the schema change on existing installs and only update
  `user_version`. This is a real trap given P0-4 may require a migration.

### P2-11. Test coverage gaps

**Directory:** `__tests__/`

Six suites cover services; no screen renders at all. `@testing-library/react-native`
is already installed and unused. Add, in rough priority order:

1. `chat/[id]` — send flow: user message persisted, placeholder created, tokens
   streamed, final status `complete`; and the error path sets status `error`.
2. Retry regenerates in place without duplicating the user turn (guards P1-3).
3. Locale switch re-renders a mounted screen (guards P1-4).
4. `downloadGguf` resume produces a byte-identical file (guards P0-1).
5. `downloadGguf` rejects a short or non-GGUF payload (guards P0-2).

### P2-12. Web target will crash on the Models and Chat screens

**Files:** `package.json` (`web` script), `app/+html.tsx`

`llama.rn` has no web implementation. `expo start --web` will fail at
`initLlama`. Either gate inference behind `Platform.OS !== 'web'` with an honest
"not supported on web" state, or drop the web target from the scripts and
`app.json` so it is not presented as working.

---

## Suggested order of work

1. **P0-3** (crash risk, 15 min) → **P0-1 + P0-2 + P2-8** together (they touch the
   same file and the seam has to be reshaped once) → **P0-4** (needs a migration, so
   land it before there is any data worth keeping).
2. **P1-1, P1-2** — the chat screen is unusable without them; do them as one pass.
3. **P1-3 + P1-7** together (both require extracting `runCompletion`).
4. **P1-4** (locale provider) — touches many files; land it on its own commit.
5. **P1-5, P1-6, P1-8, P1-9** — all in `models.tsx` / `ModelRow.tsx`; one pass.
6. P2 items as capacity allows; **P2-10**'s migration ladder should not wait if
   P0-4 lands a schema change.

## Constraints for the implementing agent

- Keep `bun run typecheck` and `bun run test` green after every item.
- Add or update a test for every P0 and for P1-3, P1-4.
- Do not introduce new dependencies beyond `expo-crypto` (P0-3) without flagging it.
- All new user-facing strings go through i18n with both `en` and `fr` entries — no
  hardcoded copy.
- Respect the tokens in `design-system/MASTER.md`: teal `#0D9488`, radius 16,
  44 pt minimum touch targets, Lora for headings / Raleway for body.
