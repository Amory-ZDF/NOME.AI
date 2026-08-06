# Design System: NOME.AI — AI Private Tutor

## 1. Visual Theme & Atmosphere

A calm, focused learning environment that feels like a well-organized study desk — warm, uncluttered, and quietly intelligent. The interface should never feel clinical or corporate. It should feel like a patient tutor who knows exactly what to say next.

- **Density:** Daily App Balanced (5/10) — information is accessible but never cramped. Teacher dashboard leans slightly denser (6/10), student side leans airier (4/10).
- **Variance:** Offset Asymmetric (5/10) — layouts have subtle asymmetry and breathing room, never rigid grids.
- **Motion:** Fluid CSS (5/10) — spring-physics transitions on interactive elements, staggered list reveals, subtle perpetual micro-loops on active dashboard indicators. Never distracting from content.

The atmosphere is: warm paper, deep teal ink, and the quiet confidence of someone who knows the material.

## 2. Color Palette & Roles

- **Warm Paper** (#FAFAF8) — Primary page background. A warm off-white that avoids the coldness of pure white or the sterility of light gray.
- **Pure Surface** (#FFFFFF) — Card and container fill. Clean contrast against the warm paper background.
- **Deep Ink** (#1C1917) — Primary text. Warm black, never pure #000. Used for headings, body text, and high-emphasis content.
- **Warm Stone** (#78716C) — Secondary text. Descriptions, metadata, timestamps, helper text. Readable but clearly subordinate.
- **Whisper Line** (rgba(231,229,228,0.6)) — Card borders, structural dividers, input outlines. Barely-there definition.
- **Deep Teal** (#0D9488) — Sole accent color. Used for: primary CTA buttons, active navigation states, progress indicators, focus rings, links, selected items. Saturation is controlled — no neon, no glow.
- **Teal Tint** (#F0FDFA) — Accent background tint. Used for selected card backgrounds, hover states on interactive rows, badge backgrounds.
- **Alert Amber** (#D97706) — Sparingly used for warnings, overdue items, pressure alerts. Never for decoration.
- **Success Green** (#059669) — Correct answers, completed tasks, positive trend indicators. Used only in data contexts.
- **Error Red** (#DC2626) — Incorrect answers, error states, destructive actions. Used only in data contexts.

**Color rules:**
- Maximum 1 decorative accent (Deep Teal). Amber/Green/Red are functional data colors only.
- No purple, no neon, no gradients on large surfaces.
- Tinted neutrals — never pure black (#000000) or pure gray.

## 3. Typography Rules

- **Display / Headings:** Satoshi — Track-tight (-0.02em), weight-driven hierarchy. H1 at 2rem/700, H2 at 1.5rem/600, H3 at 1.125rem/600. No all-caps for headings.
- **Body:** Satoshi — 1rem/400, relaxed leading (1.6), max 65 characters per line. Secondary body text in Warm Stone.
- **Chinese (Primary):** MiSans — Same hierarchy scale. MiSans pairs naturally with Satoshi for bilingual education content.
- **Mono / Data:** JetBrains Mono — For numerical data: scores, percentages, durations, dates, statistics. Monospace ensures column alignment in data tables and dashboards.
- **Banned:** Inter (overused default), system-ui (no personality), all serif fonts (dashboard/product context), Arial.

**Hierarchy principle:** Information hierarchy is communicated through weight (400/500/600/700) and color (Deep Ink / Warm Stone), not through dramatic size jumps.

## 4. Component Stylings

### Buttons
- **Primary:** Deep Teal fill (#0D9488), white text, 0.5rem border-radius. On press: translateY(-1px) with spring physics. No glow, no shadow.
- **Secondary:** Ghost/outline style — 1px Whisper Line border, Deep Ink text. On hover: Teal Tint background.
- **Destructive:** Error Red text on transparent background, red border on hover. No fill unless confirmed destructive.
- **Disabled:** Warm Stone text, Whisper Line border, no interaction.

### Cards
- Generously rounded corners (0.75rem). No nested cards.
- 1px Whisper Line border. No drop shadows by default — elevation communicated through border and background contrast.
- On hover (interactive cards): subtle background shift to Teal Tint + 1px Deep Teal border.
- Padding: 1.5rem. Internal spacing varies for rhythm — not uniform.

### Inputs / Forms
- Label above input, 0.875rem/500 in Deep Ink.
- Input: 1px Whisper Line border, 0.5rem border-radius, 2.5rem height.
- Focus: 2px Deep Teal ring (outline, not glow).
- Error: Error Red border + error message below in Error Red.
- Helper text: Warm Stone, 0.75rem.

### Badges / Tags
- Rounded pill shape (9999px radius), 0.75rem text.
- Priority badges: P0 = Alert Amber background tint + Amber text. P1 = Teal Tint + Deep Teal text. P2 = Whisper Line background + Warm Stone text.
- Status badges: Completed = Success Green tint. Overdue = Alert Amber tint. In-progress = Deep Teal tint.

### Progress Indicators
- Bar: 0.375rem height, Whisper Line background track, Deep Teal fill.
- Percentage in JetBrains Mono beside the bar.
- No animated stripes or moving gradients.

### Loading States
- Skeletal shimmer matching exact layout dimensions. Whisper Line base with subtle left-to-right shimmer.
- No circular spinners. No generic loading icons.

### Empty States
- Composed layout: centered icon (2rem, Warm Stone) + one-line description + optional CTA.
- Never just "No data" text alone.

### Data Tables
- Row hover: Teal Tint background.
- Header row: 0.75rem/600 uppercase tracking in Warm Stone.
- Row borders: 1px Whisper Line between rows, no vertical borders.
- Numbers right-aligned in JetBrains Mono.

## 5. Layout Principles

- **Max-width containment:** 1320px centered for desktop. Full-width on smaller screens.
- **Sidebar navigation (teacher):** 240px fixed left sidebar, collapsible to 64px icon-only. Content area fills remaining width.
- **Top navigation (student):** Full-width top bar with greeting, date, avatar. Content below in a single-column flow.
- **Grid system:** CSS Grid for page-level layout. Flexbox for component-level alignment. Never use calc() percentage hacks.
- **Spacing rhythm:** Section gaps use clamp(2rem, 5vw, 3rem). Card internal padding 1.5rem. Element gaps 0.75rem to 1rem. Vary spacing for rhythm — not uniform.
- **Single-column collapse below 768px:** All multi-column layouts stack vertically. No horizontal scroll.
- **Touch targets:** Minimum 44px tap target for all interactive elements on touch devices.
- **Typography scaling:** Headlines scale via clamp(). Body minimum 0.875rem on mobile.

## 6. Motion & Interaction

- **Spring physics default:** stiffness 100, damping 20. All interactive elements respond with weighty, confident motion. No bounce, no elastic, no linear easing.
- **Staggered orchestration:** Lists and card grids reveal with cascade delays (50ms between items). Never mount all items instantly.
- **Perpetual micro-interactions:** Active dashboard indicators have subtle infinite loops — a gentle pulse on unread notification dots, a slow shimmer on progress bars in active states.
- **Page transitions:** 200ms ease-out-quart opacity + translateY(8px) for incoming content. Outgoing content fades in 150ms.
- **Hover states:** 150ms ease-out for background and border color transitions.
- **Performance:** Animate exclusively via transform and opacity. Never animate top, left, width, height, or any layout property.
- **Reduced motion:** Respect prefers-reduced-motion. Disable all perpetual loops and staggered animations.

### React Bits animation components (for post-Stitch implementation)
- **Dashboard cards:** Use "Animated List" for staggered card reveals on page load
- **Progress bars:** Use "Animated Content" for smooth progress fill transitions
- **Notification badges:** Use "Border Glow" with Deep Teal color for unread indicators
- **Data trend charts:** Use "Line Waves" as a subtle background texture on the reports page
- **Task completion:** Use "Specular Button" for the satisfying completion check interaction
- **Sidebar active state:** Use "Line Sidebar" for the navigation active indicator

## 7. Anti-Patterns (Banned)

- No emojis in UI (except in designated content areas like student feedback messages)
- No Inter font — use Satoshi for English, MiSans for Chinese
- No pure black (#000000) — always use Deep Ink (#1C1917)
- No neon or outer glow shadows — especially no purple or blue glows
- No oversaturated accent colors — Deep Teal is the maximum saturation allowed
- No gradient text on headers — single solid color, emphasis via weight
- No custom mouse cursors
- No overlapping elements — every element occupies its own clear spatial zone
- No 3-column equal card grids — use 2-column, asymmetric, or varied-size layouts
- No generic placeholder names ("John Doe", "Acme") — use realistic Chinese student names in mockups
- No fake round numbers (99.99%, 50%) — use realistic data like 78%, 63%
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Empower")
- No filler UI text ("Scroll to explore", bouncing arrows)
- No nested cards — cards within cards create visual noise
- No side-stripe borders (border-left > 1px as colored accent) — use full borders or background tints
- No glassmorphism as default decoration
- No hero-metric template (big number + small label + supporting stats + gradient)
- No modals as first thought — exhaust inline/progressive alternatives first
- No em dashes (—) in UI copy — use commas, colons, semicolons, or parentheses
