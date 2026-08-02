---
name: LocalChat
description: Private on-device GGUF chat — calm teal vault, not cloud AI chrome
colors:
  harbor-teal: "#0D9488"
  on-primary: "#FFFFFF"
  warm-paper: "#FAFAF8"
  ink-forest: "#14201F"
  mist-surface: "#F0F4F3"
  soft-seam: "#D5DEDC"
  deep-ink: "#0C1211"
  pale-ink: "#E8EEEC"
  night-surface: "#1A2422"
  night-seam: "#2A3734"
  alert-red: "#DC2626"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  xs: "2px"
  md: "12px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    typography: "{typography.label}"
  button-primary-pressed:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-destructive:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-forest}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-outline-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.alert-red}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  input-composer:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.ink-forest}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
    typography: "{typography.body}"
  bubble-user:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  bubble-assistant:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.ink-forest}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  sheet-confirm:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.ink-forest}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: LocalChat

## Overview

**Creative North Star: "The Pocket Vault"**

LocalChat looks like a private pocket vault for on-device conversation — calm, precise, and sealed. Harbor Teal is the lock mark: rare, actionable, never decorative wallpaper. Surfaces stay Warm Paper by day and Deep Ink by night so the vault feels quiet rather than theatrical.

The system is refined and restrained: soft 16px corners, hairline seams, Lucide icons, and typography that does the talking (Lora for titles, Raleway for chat). Depth is mostly tonal; a single soft ambient lift is reserved for the composer bar and confirm sheets — never a floating card stack. Motion is short (150–300ms press feedback, streaming caret when allowed) and always yields to Reduce Motion.

Confirmed visual rejections: purple/indigo “AI” gradients, emoji as structural icons, hover-only affordances, and pure black `#000000` flats that smear on OLED.

**Key Characteristics:**
- Pocket Vault metaphor — privacy reads as quiet teal, not neon chrome
- Single accent (Harbor Teal) on ≤~10% of any screen
- Lora headings + Raleway body/chat at 16px / 1.5
- Flat lists with soft lift only on composer and sheets
- Light and dark are first-class; appearance follows system by default

## Colors

A cool-leaning warm-neutral field with one teal lock accent and a single alert red for stop/delete.

### Primary
- **Harbor Teal** (`{colors.harbor-teal}`): Primary actions (Send, Download, New chat, active tab tint, progress fill, user bubbles). Also the focus/ring color. Rarity is the point.
- **On Primary** (`{colors.on-primary}`): Text and icons on teal or alert fills.

### Neutral
- **Warm Paper** (`{colors.warm-paper}`): Light mode screen background.
- **Ink Forest** (`{colors.ink-forest}`): Light mode primary text.
- **Mist Surface** (`{colors.mist-surface}`): Light muted fills — assistant bubbles, composer field, sheet body, list hover-equivalent pressed rows.
- **Soft Seam** (`{colors.soft-seam}`): Light hairline borders and placeholder tint.
- **Deep Ink** (`{colors.deep-ink}`): Dark mode screen background (near-black forest, not pure black).
- **Pale Ink** (`{colors.pale-ink}`): Dark mode primary text.
- **Night Surface** (`{colors.night-surface}`): Dark muted fills.
- **Night Seam** (`{colors.night-seam}`): Dark hairline borders.

### Semantic
- **Alert Red** (`{colors.alert-red}`): Stop generation, delete, unfit/warning copy, destructive confirm.

### Named Rules
**The One Lock Rule.** Harbor Teal appears on interactive commitment (send, download, active tab, user bubble) — not as page washes, hero gradients, or decorative chips filling the screen.

**The No Purple AI Rule.** Never introduce purple, indigo, or multi-stop neon gradients as “AI branding.”

## Typography

**Display Font:** Lora (Georgia fallback) — loaded as `Lora_600SemiBold` in-app  
**Body Font:** Raleway (`Raleway_400Regular`, `_500Medium`, `_600SemiBold`)

**Character:** Lora carries vault titles with quiet serif authority; Raleway keeps chat and controls readable and modern without startup flash.

### Hierarchy
- **Display** (Lora 600, 24px, ~1.2): Empty-state titles and rare screen heroes.
- **Headline** (Lora 600, 20px): Confirm sheet titles and section emphasis.
- **Title** (Raleway 600, 16px): List row titles (model name, chat title).
- **Body** (Raleway 400, 16px, line-height 24 / 1.5): Chat bubbles, settings copy, sheet body. Prefer ≥16px for message text.
- **Label** (Raleway 500–600, 12–13px): Subtitles, warnings, button labels, progress captions. Subtitles may sit at ~0.75 opacity.

### Named Rules
**The Chat Legibility Rule.** Message body stays Raleway ≥16px with ~1.5 line-height; never shrink chat text to fit more chrome.

## Layout

Phone-first Expo tabs: **Chats | Models | Settings** (≤3). Chat is a stack push from Chats. Horizontal rhythm uses `{spacing.md}` (16) for list/bubble gutters and `{spacing.lg}` (24) for empty states and sheets. Vertical gaps: `{spacing.xs}`–`{spacing.sm}` inside rows; `{spacing.md}` between sections. Touch targets ≥44×44 with ≥8px gaps. Composer sits above keyboard + home indicator; never under either. Unfit models stay in the list at reduced opacity (~0.72) with warning text — they are not hidden.

## Elevation & Depth

Mostly flat: depth comes from Warm Paper / Mist Surface / Deep Ink tonal steps and hairline seams. Soft lift is allowed once — ambient shadow under the composer bar and confirm sheets only (preview reference: `0 12px 28px rgba(12,18,17,0.18)` for marketing chrome; in-app prefer a lighter sheet lift, e.g. `0 4px 16px rgba(12,18,17,0.12)`). Lists and bubbles stay shadowless.

### Shadow Vocabulary
- **Sheet lift** (`0 4px 16px rgba(12, 18, 17, 0.12)`): Confirm sheet and floating composer when elevated from the scroll surface.
- **Preview ambient** (`0 12px 28px rgba(12, 18, 17, 0.18)`): Marketing/mockup device chrome only — not list cards.

### Named Rules
**The Soft-Lift Exception.** Shadows are not a default card language. If it isn’t the composer or a sheet, it stays flat.

## Shapes

Gently curved vault corners: **16px** (`{rounded.lg}`) on bubbles, composer field, primary buttons, and sheet top radii. Compact row actions may use **12px** (`{rounded.md}`). Progress tracks use **2px** pill radius (`{rounded.xs}`). Borders are hairline (`StyleSheet.hairlineWidth` / 1px Soft Seam). No sharp zero-radius chrome; no pill-everything (999) except rare filter chips if needed later.

## Components

### Buttons
- **Shape:** Soft vault corners (16px primary; 12px dense row actions)
- **Primary:** Harbor Teal fill, On Primary label (Raleway medium/semibold); pressed opacity ~0.85; disabled ~0.35–0.4
- **Destructive fill:** Alert Red for Stop / confirm-delete
- **Outline destructive:** Hairline Alert Red border, Alert Red label (Delete model)
- **Ghost / cancel:** Transparent with Soft Seam border, Ink Forest label
- **Press:** Optional scale 0.97→1.0 over 150–300ms; honor Reduce Motion

### Message bubbles
- **User:** Harbor Teal fill, On Primary text, right-aligned, max-width ~85%, 16px radius, hairline border
- **Assistant:** Mist / Night Surface fill, foreground text, left-aligned, same radius
- **Streaming:** Ellipsis or caret only when motion is allowed

### Composer
- **Field:** Mist Surface fill, Soft Seam border, 16px radius, minHeight 44, multiline max ~120
- **Send / Stop:** Adjacent 44×44+ teal or alert button
- **Bar:** Background matches screen; top hairline; soft lift allowed

### Model row
- Flat list row, bottom hairline, 16px horizontal padding
- Title (Raleway 600) + subtitle (13px, muted) + optional Alert Red warning
- Progress: 4px track (seam) with Harbor Teal fill
- Unfit: opacity ~0.72, primary action disabled

### Empty state
- Lora 24 title, Raleway 16 body, primary CTA below — start-aligned, 24px padding

### Confirm sheet
- Bottom modal over 45% scrim; Mist / Night Surface panel; 16px top radii; Lora title + Raleway body; dual Cancel / Confirm

### Navigation
- Bottom tabs; active = Harbor Teal tint + weight (not color alone); Lucide icons (MessageCircle, Boxes, Settings); inactive = foreground; header uses Warm Paper / Deep Ink with teal tint for back

## Do's and Don'ts

### Do:
- **Do** treat Harbor Teal as the single lock accent for commitment actions and active state.
- **Do** keep chat body at ≥16px Raleway with ~1.5 line-height.
- **Do** support light and dark as equal themes; avoid pure `#000000` large flats.
- **Do** show unfit models as muted + disabled with an explicit RAM reason.
- **Do** respect Reduce Motion (crossfade / no caret pulse).
- **Do** keep touch targets ≥44pt with ≥8pt gaps; Lucide (or one vector set) only.

### Don't:
- **Don't** use purple/indigo gradients or “AI startup” glow stacks.
- **Don't** use emoji as nav, settings, or structural icons.
- **Don't** put drop shadows on list cards or chat bubbles.
- **Don't** invent a second brand accent; Alert Red is semantic only.
- **Don't** rely on hover-only affordances — this is phone-first.
- **Don't** place the composer under the keyboard or home indicator.
