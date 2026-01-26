# Exam Dashboard Page Overrides

> **PROJECT:** 企業教育訓練系統
> **Generated:** 2026-01-26 14:30:47
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Hero (value proposition), 2. Pricing cards (3 tiers), 3. Feature comparison, 4. FAQ, 5. Final CTA

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Popular plan highlighted (brand color border/bg). Free: grey. Enterprise: dark/premium.

### Component Overrides

- Avoid: Only test on your device
- Avoid: No feedback after submit
- Avoid: No feedback during loading

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Comparison bar animations (grow to value), delta indicator animations (direction arrows), highlight on compare
- Responsive: Test at 320 375 414 768 1024 1440
- Forms: Show loading then success/error state
- Feedback: Show spinner/skeleton for operations > 300ms
- CTA Placement: Each pricing card + Sticky CTA in nav + Bottom
