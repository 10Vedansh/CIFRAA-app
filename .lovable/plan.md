

## Will this affect the website?
**No.** Desktop/tablet sidebar (≥1024px) stays exactly as today. All changes are gated to phone widths (≤1023px) and to the wrapped mobile app. Web visitors at `cifraa.lovable.app` see zero difference on laptop.

## Goal

**1. Mobile dashboard nav → fixed bottom bar (phones only, ≤1023px)**
Replace the current top scrollable strip (`MobileNavTabs`) with a pinned bottom navigation bar that stays put while scrolling, like Groww/Kite/Instagram.

**2. Mobile app launch flow**
App opens → CIFRAA logo splash (~2.5s) → Auth → Dashboard. Skips Landing. Web is unaffected.

## Bottom nav layout

5 visible tabs + a **More** sheet:

```text
┌─────────────────────────────────────────────────┐
│  Home   AllFunds   Watchlist   Portfolio  Build  More │
└─────────────────────────────────────────────────┘
```

- The AI entry moves OUT of the tab row and INTO the **header**, replacing the profile avatar position on phones.
- Profile, Sectors, Notifications, FAQ, Sign out all live inside the **More** bottom sheet.

### Header AI button (phones only)
- Plain text button reading **`Auctus`** — no sparkle icon, no gradient, no pill chrome. Just the word, styled to match the existing header text (small, semibold, primary color, with a hover/active underline). 
- Tap behavior: switches `activeTab` to `'ai'` AND triggers a fresh chat session (clears messages, focuses input) — equivalent to ChatGPT's "New chat".
- Desktop header is untouched (FAQ, Bell, Avatar dropdown all remain).

### More sheet contents (opens from bottom on phones)
- Sectors
- My Account (profile)
- Preferences
- Notifications (with unread dot)
- Help & FAQ
- Sign out

### Bottom bar spec
- `fixed bottom-0 left-0 right-0 z-50`, `lg:hidden`
- 56px tall + `pb-[env(safe-area-inset-bottom)]` (iOS home indicator + Android gesture bar safe)
- Dark navy bg matching dashboard, top border `border-white/10`, subtle backdrop blur
- Each tab: icon (20px) + 11px label, primary color + 2px top indicator when active
- Watchlist/Portfolio show count badges (existing logic preserved)
- 6 cells total (5 tabs + More), evenly spaced

### AI tab fix
- Ensure the AI tab (`AIChat` component) renders correctly on phones: full available height between header and bottom bar, message list scrolls internally, input pinned above the bottom nav (`mb-16 lg:mb-0` on the composer).
- Add a `resetKey` prop / imperative `reset()` on `AIChat` so the header `Auctus` button can wipe the current thread and start fresh, exactly like ChatGPT's New Chat — without losing the underlying Auctus assistant config.
- Verify the existing send/stream logic still works after the layout change (no regressions to the Gemini-powered Auctus flow).

### Content padding
Add `pb-20 lg:pb-0` to the dashboard scroll area so the last card row isn't hidden behind the bar.

## Mobile app launch flow

- Detect wrapper via `?app=1` URL flag (cached in localStorage) + WebView UA fallback (`wv`, `Median`, `GoNative`, `Capacitor`, etc.)
- New `src/utils/isMobileApp.ts`
- New `src/components/mobile/AppSplash.tsx` — full-screen dark navy + CIFRAA logo fade-in (~2.5s) → auto-dismiss
- `Landing.tsx` adds early branch: `isMobileApp()` → splash → `/auth` (or `/dashboard` if already signed in). Otherwise renders Landing exactly as today.
- Wrapper start URL (you set this once in your wrapper tool): `https://cifraa.lovable.app/?app=1`

## Files

**New**
- `src/components/dashboard/MobileBottomNav.tsx` — fixed bottom bar + More sheet
- `src/utils/isMobileApp.ts` — wrapper detection
- `src/components/mobile/AppSplash.tsx` — logo splash

**Edited**
- `src/pages/Index.tsx` — swap `MobileNavTabs` for `MobileBottomNav`, add `pb-20 lg:pb-0`, wire AI-reset handler from header
- `src/components/dashboard/DashboardHeader.tsx` — on `<lg`: hide FAQ/Bell/Avatar, show plain `Auctus` text button on the right
- `src/components/dashboard/AIChat.tsx` — expose reset hook + ensure mobile layout (full height, composer above bottom nav)
- `src/pages/Landing.tsx` — app-mode early branch
- `src/components/dashboard/MobileNavTabs.tsx` — no longer rendered (kept on disk; safe to delete later)

## Responsive summary

```text
≥1024px (laptop/desktop):  left sidebar + full header                UNCHANGED
≤1023px (phone):           bottom nav + slim header (Logo + Auctus)  NEW
Wrapped mobile app:        same as phone + skip landing              NEW
```

## Out of scope
- No Auth / Onboarding / Dashboard logic changes — only nav presentation.
- Not building a native Capacitor project; staying with your wrapper.
- AI chat history persistence unchanged; the `Auctus` button only resets the current visible thread (matches ChatGPT "New chat" behavior).

