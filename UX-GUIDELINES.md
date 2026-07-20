# UX Guidelines — Calculator

This document is the canonical reference for UX/i18n/theme conventions in this
repo. AGENTS.md covers build commands and locked contracts; this file covers
**how features should look, feel, and behave** so contributors ship consistent
Apple-HIG-quality UI without having to reverse-engineer existing components.

Owner: Minimax-M3 (UI). General contributes scaffold/engine/native but should
still follow these rules when touching UI files.

## 1. Design tokens are the single source of truth

All color / spacing / radius / motion / elevation MUST come from a token in
`src/styles/tokens.css`. No hex literals outside that file.

- Light theme `:root` block — base palette
- Dark theme `:root[data-theme='dark']` — dark palette
- System-pref fallback `@media (prefers-color-scheme: dark)` — only applies
  when no explicit `data-theme` attr is set on `<html>`

Adding a new color? Add a token first, reference it by `var(--name)`. Don't
inline-style it. Component-level overrides belong inline at the use site, but
the *value* still comes from a token.

## 2. Display vs. keypad contrast (Apple aesthetic)

The Apple calculator has a dark display strip on top contrasting with a lighter
keypad below. We achieve this with two tokens:

- `--bg-display` — the display area background (dark in both themes for that
  calculator-display look)
- `--text-display` — display text color (white in both themes)

Apply both to the `.display-area` wrapper in `App.tsx`. Do NOT apply `--bg`
to the display — that's the keypad surface. Keeping them distinct is what
creates the Apple-style contrast.

## 3. Touch targets

- Minimum 44×44px (Apple HIG). Our compact keys use `clamp(48px, 10vw, 60px)`
  for height and `clamp(15px, 3.4vw, 18px)` for font size — comfortably above
  the floor on phones, scaling up on tablets.
- Pills (icon buttons in the tab bar) are 32px tall but have generous padding
  around them; the tap area extends to the padding.
- Never use `transform: scale()` for press feedback on a tiny element — it
  shrinks the tap target. Use `filter: brightness(0.94)` instead (already in
  `.ui-key:active`).

## 4. Long-press interactions

Long-press is implemented with pointer events (`onPointerDown` + `onPointerUp`
+ `onPointerLeave` + a `setTimeout`). Do NOT use `onDoubleClick` — it requires
mouse and is invisible to touch users.

The pointer-event pattern works across mouse, touch, and pen. The timer
(default ~500ms) fires the long-press action; a quick `pointerup` before the
timer fires the short-press action. Always cancel the timer on `pointerleave`
or `pointercancel`.

## 5. Sticky last-good live result

When the user types an incomplete expression (`1+`, `sin(`, `(2+3)*`), the
display shows the **last good live result** in italic, NOT an error. The error
codes `UNCLOSED`, `PAREN`, `MISSING_OPERAND` are *deferred* — they only become
visible after the user presses `=` (commits the expression).

Live errors (`UNKNOWN_SYMBOL`, `NOT_FUNCTION`, `CONVERT`, `ENGINE`) surface
immediately as the user types.

The `liveSticky` flag on `<Display>` enables italic styling on the result.
**Do NOT use `opacity < 1`** to indicate stickiness — it creates a compositing
layer that intercepts pointer events on the keypad below (real e2e regression
we hit in M8). Italic + the existing color is enough.

## 6. Error display

Errors render with:

- A red circular glyph badge to the left (one Unicode char per error code, see
  `errorGlyph()` in `Display.tsx`)
- The localized error message to the right
- Result font auto-shrinks via `clamp(22px, 4.5vw, 36px)` so long messages
  don't overflow

Error codes are stable engine-side constants (see AGENTS.md locked contracts).
UI maps each code to a glyph + a localized message via
`localizeErrorMessage(locale, code, fallback)`. Never display the raw engine
Chinese string in non-zh locales.

## 7. Internationalization (i18n)

- All user-visible text MUST go through `t('key')` from `useI18n()`.
- This **includes aria-labels** — screen readers read them aloud, and a Chinese
  user with a screen reader should hear Chinese, not English.
- Add new keys to BOTH `src/i18n/zh.ts` (canonical) AND `src/i18n/en.ts`
  (mirror). Keep keys 1:1.
- Key namespacing: `mode.*`, `common.*`, `key.*`, `error.*`, `history.*`,
  `sync.*`, `date.*`, `units.*`, `prog.*`, `picker.*`, `app.hint.*`.
- Variable interpolation: `t('sync.status.connected.summary')` returns
  `'已同步 · {time} · {count} 条'` — replace `{time}` and `{count}` at the
  call site.

### Known i18n debt (deferred)

The following aria-labels still leak English in zh locale (and vice versa).
They are NOT fixed in the low-severity PR because fixing them requires
coordinated e2e test updates (Playwright `getByRole({ name: 'Open parenthesis' })`
selectors would break in zh locale). Tracked separately:

- `Keypad.tsx` — 11 main-keypad aria-labels + 12 scientific-function arias
- `Display.tsx` — `aria-label="Expression"` (also coupled to `App.tsx:118`
  string-compare detection — fix together via `data-*` attribute)
- `TabBar.tsx` — mode + angle-mode arias
- `DateTime.tsx`, `Units.tsx`, `SyncSettings.tsx` — sub-mode arias

When fixing these, switch e2e role-based selectors to `getByTestId()` or
accept that test names need locale-aware matching.

## 8. Theme switching

- `data-theme` attribute on `<html>` (`'light'` or `'dark'`) is the source of
  truth. Set by inline script in `index.html` (first paint) and by
  `useTheme().toggle()` (runtime).
- Persisted to `localStorage['theme-pref']`.
- When no explicit pref is stored, follow OS `prefers-color-scheme` and keep
  tracking changes via `matchMedia` listener.
- The `<meta name="theme-color">` tag (id=`theme-color-meta`) MUST stay in sync
  with the active theme so PWA splash screens and iOS/Android status bars match:
  - light → `#f2f2f7`
  - dark → `#000000`
- The inline bootstrap script in `index.html` updates the meta tag on first
  paint (before React mounts). `useTheme` updates it on toggle and on OS-pref
  change.

## 9. Reduced motion

`@media (prefers-reduced-motion: reduce)` zeroes out `--dur-*` tokens and
disables `.ui-key:active { transform: scale(0.97) }`. New animations should
respect this — gate them on `--dur` or use `prefers-reduced-motion` directly.

## 10. Compositing layer gotcha

`opacity < 1` on an element creates a GPU compositing layer. If that element
sits above interactive elements (keypad, buttons), the layer can intercept
pointer events even when the element itself isn't a pointer target.

Symptom: e2e tests fail with "element X intercepts pointer events on element Y"
even though visually nothing is in the way.

Fix: use a different visual cue (italic, font-weight, color shift) instead of
opacity. If opacity is unavoidable, set `pointer-events: none` on the
non-interactive layer.

## 11. Locale-aware testing

E2e tests pin `localStorage.setItem('lang-pref', 'zh')` in `clearAndSeedBasicSkip`
to stabilize the locale across CI runners (otherwise `navigator.language`
differs between GitHub Actions runners and breaks role-based selectors).

When adding new e2e tests:

- Use `getByTestId()` for locale-independent selectors (preferred).
- If using `getByRole({ name: ... })`, the name MUST match the zh string
  (since that's the pinned locale) — e.g. `name: '基础'` not `name: 'Basic'`.
- For aria-label based selectors, same rule: zh string.

## 12. iOS safe areas

iOS notch / home-indicator safe areas are handled via
`env(safe-area-inset-*)` in `.shell` padding. An extra inline `<style>` is
injected at runtime (`ios-safe-area-display`) to extend the dark display
background into the status bar area on iOS — this gives the Apple Calculator
full-bleed look.

Do NOT remove the `isIOS` guard — the safe-area tweak is iOS-only and breaks
Android/Desktop layouts if applied globally.

## 13. Pointer-events on overlays

When showing an overlay (modal, hint banner, picker), make sure:

- The overlay has a higher `z-index` than what's beneath (see `--z-*` tokens).
- The overlay's container doesn't accidentally cover interactive elements
  with a transparent / non-`pointer-events: none` layer.
- Dismissing the overlay (Esc, backdrop click, close button) returns focus to
  a sensible element (the expression input for SyncSettings, the picker for
  the home picker).

## 14. History list

- Empty state uses `t('history.empty.title')` + `t('history.empty.desc')` with
  a ⌛︎ icon.
- Populated state shows a section header (`t('mode.history').toUpperCase()` —
  uppercase in English via `String.prototype.toUpperCase()`, unchanged in
  Chinese since CJK has no case).
- Each entry is a button (clickable to recall). Expression on top (secondary
  color), result below (tertiary color, larger font, tabular-nums for alignment).
- Clear button uses `t('history.clear')` (danger-colored).

## 15. Programmer mode radix switch

When the user switches radix (HEX/DEC/OCT/BIN), ALL number tokens in the
expression are converted to the new radix — not just the last one. This is
`replaceAllNumberTokens()` in `Programmer.tsx`. A naive `lastNumberToken`
replacement silently misleads the user (e.g. `10+5` in HEX → DEC would yield
`10+5`=15 instead of the correct `16+5`=21).

If any token fails to convert, the whole expression is left unchanged (no
partial state). Radix switch dispatches only when the new expression actually
differs.
