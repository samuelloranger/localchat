# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** LocalChat  
**Generated:** 2026-08-01  
**Category:** Private on-device AI chat (personal assistant)  
**Source of truth for product:** `docs/superpowers/specs/2026-08-01-localchat-design.md`

---

## Global Rules

### Color Palette

| Role | Hex | Token |
|------|-----|-------|
| Primary / Accent | `#0D9488` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Background (light) | `#FAFAF8` | `--color-background` |
| Foreground (light) | `#14201F` | `--color-foreground` |
| Muted surface (light) | `#F0F4F3` | `--color-muted` |
| Border (light) | `#D5DEDC` | `--color-border` |
| Background (dark) | `#0C1211` | `--color-background-dark` |
| Foreground (dark) | `#E8EEEC` | `--color-foreground-dark` |
| Muted (dark) | `#1A2422` | `--color-muted-dark` |
| Border (dark) | `#2A3734` | `--color-border-dark` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring / focus | `#0D9488` | `--color-ring` |

**Notes:** Teal = on-device / private. No purple/indigo gradients. Avoid pure `#000000` OLED smear on large flats.

### Typography

- **Heading:** Lora (400–700)
- **Body:** Raleway (400–600)
- **Chat body:** Raleway 16pt+, line-height ~1.5
- Load via `@expo-google-fonts/lora` + `@expo-google-fonts/raleway` with `font-display` equivalent / avoid FOIT on first paint where possible.

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4 | Tight gaps |
| `--space-sm` | 8 | Touch gaps (minimum between targets) |
| `--space-md` | 16 | Default padding |
| `--space-lg` | 24 | Section spacing |
| `--space-xl` | 32 | Screen edges / large separation |

### Radius & motion

- Bubble / control radius: **16**
- Press scale: **0.97 → 1.0**, duration **150–300ms**
- Respect `prefers-reduced-motion` / Reduce Motion accessibility setting
- Streaming caret only when motion allowed

### Icons

- Lucide (or one consistent vector set) — **never emoji as structural icons**
- Touch targets ≥ **44×44**; icon may be smaller with hitSlop

### Navigation

- Bottom tabs ≤ 3 for MVP: Chats | Models | Settings
- Active tab: teal indicator + weight change (not color alone)
- Chat is a stack push from Chats

### Anti-patterns

- Purple / indigo “AI” gradients
- Emoji icons in nav or settings
- Hover-only affordances
- Composer under keyboard or home indicator
- Instant 0ms state changes without feedback
- Placeholder-only labels on settings controls

### Pre-delivery checklist

- [ ] Contrast ≥ 4.5:1 body text in light and dark
- [ ] Focus / selected states visible
- [ ] Reduced motion respected
- [ ] Safe areas + keyboard avoided
- [ ] Empty / loading / error states for Chats, Models, Chat stream
- [ ] EN + FR strings for all user-visible copy

## Page overrides

Create `design-system/pages/<name>.md` only when a screen intentionally diverges from this Master (e.g. Models download progress).
