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

---
---

# Second pass — 2026-08-01 (later)

**Reviewed at:** `a107228` "feat: Models browser filters, sort, and device RAM fit"
plus the uncommitted `app.json` change adding `expo-device` to `plugins`.
**Baseline:** `bun run typecheck` clean, `bun run test` = 7 suites / 18 tests passing.

Everything in the first pass still stands — none of the P0/P1 items have been
addressed. What follows covers only what is **new** since `c98fcf2`:

- `src/services/deviceCapability.ts` (new) — RAM estimation and fit gating
- `src/services/modelCatalog.ts` (new) — quant parsing, filters, sort
- `src/services/hfHub.ts` — model-card metadata (downloads, lastModified),
  8 curated repos, browse cap raised to 8 GiB
- `app/(tabs)/models.tsx` — 223 → 389 lines: search/quant/size/sort/fits chips
- `src/components/ModelRow.tsx` — `unfit` + `warning` props
- `src/services/modelStore.ts` — fit gate in `installFromHub`
- `app/chat/[id].tsx` — `modelReady` now gated on RAM fit

Numbering continues from the first pass. **P0-5 is a build breakage — do it first.**

---

## P0 (continued)

### P0-5. `ios.deploymentTarget: "15.1"` fails `expo prebuild` outright

**File:** `app.json` — `expo-build-properties` plugin config

Verified by running it:

```
Error: `ios.deploymentTarget` needs to be at least version 16.4.
    at maybeThrowInvalidVersions (expo-build-properties/build/pluginConfig.js:267)
```

`expo-build-properties` for SDK 57 validates the deployment target and throws below
16.4. This aborts config resolution, so it fails **both** the iOS and the Android
prebuild — no native project is generated at all. Nothing can be built, sideloaded,
or shipped until it changes.

**Fix:** set `ios.deploymentTarget` to `"16.4"` (or higher). Confirmed locally: with
that single change, `bunx expo prebuild -p android --clean` runs to
`✔ Finished prebuild`.

**Done when:** `bunx expo prebuild --clean` completes for both platforms. The CI
`check` job now gates on this.

**Two more config problems surfaced by the same run — fix them in the same pass:**

- `enableOpenCL` on the `llama.rn` plugin is deprecated:
  `enableOpenCL is deprecated. Use enableOpenCLAndHexagon instead.` Rename the key.
  Left as-is, GPU acceleration on Adreno may silently not be configured, which
  directly affects whether inference is usable on Android.
- `» android: userInterfaceStyle: Install expo-system-ui in your project to enable
  this feature.` — `app.json` sets `"userInterfaceStyle": "automatic"`, but without
  `expo-system-ui` that is a no-op on Android. The app's entire dark-mode story
  depends on it. `bunx expo install expo-system-ui`.

### ~~P0-5b. `"expo-device"` in `plugins`~~ — RETRACTED, not a defect

The second pass claimed that listing `expo-device` in `expo.plugins` would fail
prebuild because the package ships no `app.plugin.js`. **That was wrong.** Verified
by running prebuild with the entry present: it completes cleanly. Current
`@expo/config-plugins` tolerates a module with no plugin entry point rather than
throwing.

The entry is still redundant — `expo-device` is autolinked and needs no `plugins`
entry — so removing it is a tidy-up, not a fix. No urgency.

### P0-6. On iOS the RAM fit check compares against the wrong number

**File:** `src/services/deviceCapability.ts:13-17, 31-43`

`Device.totalMemory` returns the device's **physical** RAM. Expo's own doc comment
says it outright: *"This is the total memory accessible to the kernel, but not
necessarily to a single app."*

On iOS that gap is the whole story. A single app is killed by jetsam well below
physical RAM — commonly in the range of a third to a half of it, and the limit
depends on the device and on what else is resident. Taking 80 % of physical RAM
(`DEVICE_RAM_USABLE_FRACTION = 0.8`) as the app's budget is therefore wrong by a
factor of roughly two on iOS. A 6 GB iPhone will be told it can spend ~4.8 GB; in
practice the app is killed long before that. The gate will happily green-light a
model that reliably crashes the app on load.

**Fix:** make the usable fraction platform-dependent, and be conservative:

- iOS: budget against a jetsam-style estimate, not physical RAM. A fraction in the
  0.35–0.45 range of physical RAM is the defensible starting point.
- Android: 0.8 of `totalMemory` is roughly defensible for a foreground app, but
  should still leave room — 0.6–0.7 is safer given the OS will reclaim aggressively.

Do not present the resulting number as authoritative until it has been measured on
at least one low-RAM device per platform. Record the measurements next to the
constants so the numbers are traceable rather than folklore.

**Done when:** the fraction is chosen per platform, each constant carries a comment
explaining its basis, and a test asserts iOS gets a strictly smaller budget than
Android for identical `totalMemory`.

### P0-7. The RAM heuristic hard-blocks the user, including on already-installed models

**Files:** `app/(tabs)/models.tsx:180-181, 314-317`, `src/services/modelStore.ts:99-105`,
`app/chat/[id].tsx` (`modelReady`)

The fit estimate is a heuristic — `fileSize × 1.35 + 256 MB` — and it is currently
wired as a hard block in four places:

1. `startDownload` returns silently when `!fit.fits` (no message at all).
2. `ModelRow` disables the primary button via `blocked = disabled || busy || !!unfit`.
3. `installFromHub` throws `MODEL_TOO_LARGE`.
4. `chat/[id].tsx` computes `modelReady` from `evaluateModelFit(model.sizeBytes)` and
   disables the composer when it fails.

Two problems compound.

**First, the estimate is pessimistic for how this app actually loads models.**
`inference.ts` sets `use_mmap: true`. With mmap the weights are demand-paged from
disk and the clean pages are evictable, so resident footprint is not `1.35 ×` the
file. The multiplier is a reasonable worst case for a `mmap: false` load; applied to
an mmap'd load it locks users out of models their device can run.

**Second, and worse: point 4 is a silent dead-end for existing data.** A model that
was installed while it passed the check — or installed before this check existed, or
on a device whose `totalMemory` now reads differently — makes every conversation
bound to it unusable. The composer is disabled with **no banner, no explanation, and
no way out**. The user sees a chat screen they cannot type into. The Models tab is no
better: `onPrimary` does `if (warning) return`, so the installed model's own action
is dead too, and the only enabled control is Delete.

**Fix:**

- Downgrade the gate from a block to a **warning with explicit override** for
  downloads. Show the estimate and the device budget (the copy already exists via
  `models.unfitRam`), and let the user proceed through a confirmation that states the
  risk plainly. This is a heuristic making a guess about their hardware; it should not
  have the final say.
- **Never** disable the composer for an installed model. If a conversation's model is
  over budget, let the user try — and surface the crash risk as a dismissible banner
  on the chat screen, not as a dead input.
- Keep the check strict in exactly one place if you want a real backstop: catch the
  actual failure from `initLlama` and report it, which is ground truth rather than
  arithmetic.
- If `installFromHub` keeps its gate, it must throw a **typed** error
  (`ModelTooLargeError` with structured fields), not a string with raw byte counts
  interpolated into it — the UI cannot localise `MODEL_TOO_LARGE: needs 5637144576
  bytes, device usable 3435973836`.

**Done when:** no user-reachable state exists where a downloaded model cannot be used
and the UI does not say why; and every refusal path shows localised copy naming the
estimate, the budget, and the next action.

---

## P1 (continued)

### P1-10. Every search fires two identical hub requests

**File:** `app/(tabs)/models.tsx:148-162`

`useFocusEffect`'s callback now lists `query` in its dependency array and calls
`loadHub(query)`. The debounced `onSearch` **also** calls `setQuery(text)` *and*
`void loadHub(text)`. So each settled keystroke does:

1. `loadHub(text)` — explicit call.
2. `setQuery(text)` → new `useCallback` identity → `useFocusEffect` re-runs →
   `loadHub(query)` again.

Two full search round trips per query, each of which (see P1-11 / P2-2) fans out into
dozens of sequential tree fetches. The two responses race, and the loser can overwrite
the winner's results.

**Fix:** pick one owner. Keep the focus effect for the initial/refocus load only
(depend on `refreshInstalled` and `loadHub`, not `query`, and read the current query
from a ref), and let the debounce own subsequent fetches. Add a request-sequence guard
so a stale response cannot overwrite a newer one.

**Done when:** one settled keystroke produces exactly one hub search, verified by
counting `fetch` calls in a test.

### P1-11. Server results are re-filtered client-side by raw substring, hiding valid hits

**Files:** `app/(tabs)/models.tsx:164-177`, `src/services/modelCatalog.ts:52-55`

`query` goes to the Hub API; `localQuery` is *also* passed into `applyModelFilters`,
which requires `"${displayName} ${repoId} ${filename}".toLowerCase()` to contain the
raw query string as a literal substring.

The Hub matches loosely — `"llama 3.2"` returns `bartowski/Llama-3.2-3B-Instruct-GGUF`.
The local filter then asks whether `"llama-3.2-3b-instruct-gguf/…"` contains the
literal `"llama 3.2"` (with a space). It does not. **The user searches, the API
returns correct results, and the app hides all of them.** Any multi-word query is
affected.

It also means results vanish and reappear during the 300 ms debounce window, as
`localQuery` updates before `query` does.

**Fix:** do not re-apply the free-text query locally to server-side results. Either
drop `query` from the local filter entirely, or tokenise it (split on whitespace,
require every token to appear) so that loose matching is preserved. The quant/size/fit
filters should still apply locally — those are genuinely client-side concerns.

**Done when:** a multi-word search returns the same rows the API returned, and a test
covers `applyModelFilters` with a multi-token query.

### P1-12. Filtering to an empty result set renders nothing at all

**File:** `app/(tabs)/models.tsx:289-304`

`ListHeaderComponent` shows `EmptyState` only when `installed.length === 0 &&
filteredAvailable.length === 0`. With one model installed and filters that exclude
everything, the screen shows the chips, the "Installed" heading, the installed row,
and then blank space. There is no "no results", no indication that filters are
responsible, and no way to clear them other than tapping each chip back.

Compounding it: the empty-state copy is `models.empty`, which reads as
"nothing available" — wrong when the cause is an active filter, and wrong again when
the cause is being offline.

**Fix:** distinguish the three states with distinct localised copy — offline, no
results from the hub, no results *for the current filters* — and give the third a
"Clear filters" action that resets quant/size/fits/sort in one tap. Show it whenever
`filteredAvailable` is empty, independent of `installed.length`.

**Done when:** each of the three empty states renders its own message in EN and FR,
and the filtered-empty state offers a working reset.

### P1-13. Hardcoded English in the model subtitles

**File:** `app/(tabs)/models.tsx:312, 333-335`

```ts
subtitle={`${formatMb(m.sizeBytes)} · ~${formatGiB(...)} GB RAM`}
```

`GB RAM` is literal English, concatenated outside i18n, and it ships to French users
verbatim. The download-count suffix `` `· ${f.downloads.toLocaleString()}↓` `` has the
same problem — a bare `↓` glyph carries no meaning to a screen reader, and
`toLocaleString()` formats to the *device* locale, ignoring the app's language
preference.

**Fix:** move the whole subtitle into an i18n template
(`models.subtitle` with `size`, `ram`, `quant`, `downloads` interpolations) and give
each locale its own ordering and units. Format the download count through the app
locale, and add an `accessibilityLabel` on the row that spells out "N downloads"
rather than relying on the arrow.

**Done when:** no user-facing string is assembled from English literals in
`models.tsx`, and FR renders correct units and word order.

### ~~P1-14. `expo-device` may not be a declared dependency~~ — RETRACTED, not a defect

Re-checked: `expo-device` **is** declared in `package.json` (`"expo-device":
"^57.0.1"`). The second pass missed it. No action needed.

---

## P2 (continued)

### P2-13. `parseQuantFamily` misses common filename shapes

**File:** `src/services/modelCatalog.ts:15-31`

Every pattern requires a trailing `_` or `-`: `/q4[_-]/i`. Real filenames that fail:

- `model-q4.gguf` → `other` (no trailing separator)
- `Model.Q4.gguf` → `other` (dot separator)
- `ggml-model-q4_0-v2.gguf` → matches, fine

Files classified as `other` are invisible to the Q4 filter chip — the single most
useful filter on the screen.

**Fix:** anchor on a boundary instead of a literal separator:
`/q4(?=[_\-.]|$)/i` applied to the basename. Add table-driven tests covering the
dot-separated and bare-suffix forms.

### P2-14. Fit math is decoupled from the actual context size

**Files:** `src/services/deviceCapability.ts:8`, `src/services/inference.ts:29`

`KV_HEADROOM_BYTES` is a flat 256 MiB, while the KV cache is a function of `n_ctx`,
layer count, and head dimensions — none of which the estimator sees. `n_ctx` is
hardcoded to 2048 in `inference.ts`, so today the constant happens to be generous.
The moment `n_ctx` becomes configurable (a likely near-term feature, and already
implied by P2-1), the fit gate will silently under-estimate and start approving
models that OOM.

**Fix:** pass `n_ctx` into `estimateRuntimeRamBytes` and derive the KV allowance from
it, even with a crude per-token coefficient. Export `n_ctx` from one module so the
estimator and the loader cannot disagree.

### P2-15. `MAX_GGUF_BYTES` is now a lie

**File:** `src/services/hfHub.ts:7-8`

```ts
/** Legacy alias used by download paths that still prefer phone-friendly files. */
export const MAX_GGUF_BYTES = BROWSE_MAX_BYTES
```

The comment claims it caps downloads to phone-friendly sizes; it is aliased to the
8 GiB browse cap, and nothing outside `hfHub.ts` references it (verified by grep).
So there is no size cap on the download path at all, and the comment actively
misleads the next reader into thinking there is.

**Fix:** delete the alias and the comment. If a hard download cap is wanted, add it
deliberately with its own constant and a test.

### P2-16. `fitForFile` is being called with fabricated objects

**Files:** `app/(tabs)/models.tsx:209-216, 312`

```ts
fitForFile({ repoId: '', filename: '', displayName: '', sizeBytes }, deviceRam)
fitForFile({ ...m, repoId: m.repoId, filename: m.filename, displayName: m.displayName }, deviceRam)
```

The first invents an empty `HubGgufFile` to reach a function that only reads
`sizeBytes`. The second spreads a model and then redundantly re-assigns three fields
it already spread. Both are noise around a function whose signature is wrong for the
call sites.

**Fix:** call `evaluateModelFit(sizeBytes, deviceRam)` directly at both sites and drop
`fitForFile`, or narrow its parameter to `Pick<HubGgufFile, 'sizeBytes'>`.

### P2-17. Redundant work in `applyModelFilters`

**File:** `src/services/modelCatalog.ts:50-65`

`withCatalogFields(file)` is called for every item — allocating a new object per
row — and then line 56 re-derives the quant anyway with
`enriched.quant ?? parseQuantFamily(enriched.filename)`, which can never hit the
fallback because `withCatalogFields` just populated it. Runs on every keystroke over
every result.

**Fix:** enrich once at ingest (`filterGgufEntries` already sets `quant`, so the
enrichment is largely redundant to begin with), and have the filter read
`file.quant` directly.

### P2-18. Sort-by-downloads sorts by repository, not by file

**Files:** `src/services/hfHub.ts:86-89`, `src/services/modelCatalog.ts:80-83`

`filterGgufEntries` stamps the repo card's `downloads` and `lastModified` onto every
file in that repo, so all four quants of a repo tie exactly and fall through to a
`displayName` comparison. The "Downloads" chip therefore orders repos, not models —
defensible, but not what the label implies, and the tie-break puts alphabetical
order ahead of size, which is the thing a mobile user actually cares about.

**Fix:** keep repo downloads as the primary key (per-file counts are not available
from the tree API), but tie-break on `sizeBytes` ascending so the most phone-friendly
quant of a popular repo surfaces first. Rename the chip to make the granularity
honest ("Popular").

### P2-19. The filter UI consumes most of a small screen

**File:** `app/(tabs)/models.tsx:241-273`

Three stacked horizontal `ScrollView`s — fit+quant, size, sort — plus the search
field and the device-RAM line sit above the list. On a 5.4" phone that is a large
fraction of the viewport before a single model is visible, and horizontal scrollers
hide their overflow with no affordance, so options past the right edge are
undiscoverable.

**Fix:** collapse to one row showing the active filters as a summary, opening a sheet
for the full set. At minimum, merge the three scrollers into one and move sort into a
compact control aligned with the section header.

Also: the `Chip` component sets `minHeight: 36`, below the 44 pt minimum touch target
the design system mandates and that the rest of the app respects. Chips need
`accessibilityState={{ selected: active }}` — right now a screen reader cannot tell
which filter is active.

### P2-20. New modules are thinly tested and the fallback path is untested

**File:** `__tests__/deviceCapability.test.ts`

Good coverage of the pure arithmetic. Gaps that matter:

- `getDeviceRamBytes()` is never exercised — neither the `Device.totalMemory` path nor
  the `FALLBACK_DEVICE_RAM_BYTES` path. Mock `expo-device` and cover both, including
  `null` and `0`.
- `FALLBACK_DEVICE_RAM_BYTES` is 4 GiB — an *optimistic* default for an unknown
  device. When RAM is unknown the safe assumption is the low end, not the middle.
  Lower it to 2 GiB and assert the choice in a test with a comment explaining why
  conservative is correct here.
- `modelCatalog` shares a test file with `deviceCapability`. Split them.
- No test covers `applyModelFilters` with `maxSizeBytes`, nor the multi-token query
  case from P1-11, nor `sortModels('updated')` with missing `lastModified`.

### P2-21. `evaluateModelFit()` is called during render with no memoisation

**File:** `app/chat/[id].tsx` (`modelReady`)

`modelReady` is an IIFE calling `evaluateModelFit(model.sizeBytes)`, which defaults
its second parameter to `getDeviceRamBytes()` — a native module read — on **every
render** of the chat screen, including every streaming flush. Cheap individually,
wasteful at 20 flushes/second, and it makes render impure.

**Fix:** read device RAM once (as `models.tsx` does with
`useState(() => getDeviceRamBytes())`) and wrap the fit computation in `useMemo`.
Better still, lift the value into a small `useDeviceRam()` hook so both screens share
one read.

---

## Revised order of work

1. **P0-5** — `expo prebuild` fails outright, so nothing can be built or sideloaded.
   One line, plus the two config problems noted alongside it
   (`enableOpenCLAndHexagon`, `expo-system-ui`). Do it first. (P0-5b and P1-14 are
   retracted — not defects.)
2. **P0-3**, then **P0-1 + P0-2 + P2-8** as one pass, then **P0-4**. (Unchanged from
   the first pass — these are still the correctness floor.)
3. **P0-7** — the RAM gate can strand a user in an unusable chat with no explanation.
   Fix the dead-end before the estimate itself. **P0-6** follows: get the iOS number
   defensible, since P0-7 turns the gate into advice and the advice should be right.
4. **P1-10 + P1-11** together — both are in the search path, and P1-11 is the one
   users will report as "search is broken".
5. **P1-1, P1-2** (chat unusable), then **P1-3 + P1-7**.
6. **P1-4** (locale provider) on its own commit.
7. **P1-5, P1-6, P1-8, P1-9, P1-12, P1-13** — one pass over `models.tsx` /
   `ModelRow.tsx`.
8. P2 items as capacity allows; **P2-13** is fifteen minutes and materially improves
   the quant filter, so it is worth pulling forward.

## Note on the two passes

The first pass reviewed `f5fd093` + working tree; this pass reviewed `a107228`. No
first-pass finding has been fixed in the interim, and three of them got worse:

- **P2-2** (serial N+1 in hub search) now iterates 25 repos instead of 20, and the
  empty-query path adds a model-card fetch per repo — with P1-10 doubling the whole
  thing. This has effectively become a P1.
- **P1-8** (mislabelled section header) still stands, now with filtered results
  underneath a heading that says "Installed".
- **P1-9** ("New chat" only switches tabs) picked up an extra early-return
  (`if (warning) return`) that makes the row's only useful action dead for unfit models.
