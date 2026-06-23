---
name: mobile-responsive-training-ui
description: Use when adjusting an existing page in this repo (教育訓練教材及線上考卷) for mobile/touch screens — symptoms include a tab bar or button row overflowing on narrow viewports, grid columns too cramped below 400px, undersized touch targets, or text/badges clipping on a single flex row. Layout-only; not for new feature work.
---

# Mobile-Responsive Training UI

## Overview

Tailwind responsive-class checklist for retrofitting existing pages in this
codebase to phones (375–430px) without touching business logic or APIs.
Built from Wave 5 (考試中心 + 成績中心); reuse for "其餘頁面依第一階段模式擴展".

## When to Use

- A page works on desktop but a PM/user reports it's cramped, clipped, or has
  a horizontal scrollbar on a phone.
- Symptoms: tab bar with 3+ buttons in a `w-fit` row, `grid-cols-2+` info
  cards, a `flex items-center justify-between` row with a title + multiple
  buttons, an inline button used as a primary CTA on a card.

**Not for:** business logic, API contracts, or shared cross-project
components (`@shared-ui/*` — those need their own change process). Not for
turning a `<table>` into a card list — that's a bigger redesign, scope it
separately.

## Quick Reference

| Symptom | Fix |
|---|---|
| Tab bar / button row overflows narrow screen | Wrap in `overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0`; each button gets `shrink-0 whitespace-nowrap`; padding `px-3 sm:px-5` |
| Title + multiple buttons won't fit one row | `flex items-center justify-between` → `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3` |
| `grid-cols-2` (or more) too dense on phone | Prepend `grid-cols-1` before the existing breakpoints: `grid-cols-1 sm:grid-cols-2 ...` |
| Page/card padding too tight or too much wasted space | `p-6` → `p-4 sm:p-6` |
| Heading too large on phone | `text-3xl` → `text-2xl sm:text-3xl` |
| Icon badge eats width / shouldn't shrink | `w-14 h-14` → `w-12 h-12 sm:w-14 sm:h-14`, add `shrink-0` |
| Primary CTA button is undersized / inline-width | Add `w-full`; bump `py-2.5` → `py-3` (≥44px touch target) |
| Short text + badge clipped on one line | Add `flex-wrap` to the row |
| Wide `<table>` | Leave it `overflow-x-auto`-wrapped (horizontal scroll) — don't redesign |

## Project-Wide Setup (one-time, already done)

`frontend/index.html` viewport meta needs `viewport-fit=cover` for
`env(safe-area-inset-*)` to resolve to non-zero values on notched devices.
Check it's still there before assuming safe-area utilities will work.

## Verifying Changes

No project skill exists yet for running this app's dev servers — see below
if one gets added later. Manual steps used in Wave 5:

```bash
# backend
cd backend && export PYTHONPATH=$PYTHONPATH:. && \
  .venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# frontend
cd frontend && npm run dev &

# get a JWT without dealing with the captcha image (dev-only bypass):
curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" \
  -d '{"emp_id":"<some active emp_id>","captcha_id":"x","answer":"0000"}'
```

If `playwright` isn't installed: `npm install -D playwright && npx playwright
install chromium` works (downloads from a CDN, needs sandbox disabled in this
harness). **Revert `package.json`/`package-lock.json` with `git checkout --`
after testing** — it's a throwaway dev dependency, not a real project
addition. Kill the dev servers you started; don't touch one already running
on the user's own port.

Script pattern: `chromium.launch()` → `newContext({ viewport: {width,
height} })` → `page.addInitScript(token => localStorage.setItem('token',
token), JWT)` → `page.goto(...)` → `page.screenshot()`. Use 375×667 (iPhone
SE) as the tightest realistic target. Check `page.on('console', ...)` for
errors, not just that the screenshot rendered.

## Common Mistakes

- Forgetting `shrink-0` on tab/button-row children inside `overflow-x-auto`
  — without it the flex items shrink instead of the row scrolling.
- Using `flex-wrap` on a row where wrapping would visually misalign with a
  sibling element — check the screenshot, don't assume.
- Redesigning a working desktop table into cards "while you're in there" —
  that's a separate, larger task; stay in scope.
