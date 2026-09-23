# CineSlate

> A local-first, high-precision film journal and social critique space built with Next.js 15, Tailwind CSS v4, and IndexedDB.

**Live Application:** [movie-review-space.vercel.app](https://movie-review-space.vercel.app)

---

## Overview

CineSlate brings the tactile, dark charcoal aesthetic of Letterboxd into a zero-latency, local-first web application. Log films, scrub half-star ratings with pointer or keyboard precision, inspect dynamic rating histograms, curate drag-and-drop lists, and write Markdown reviews protected by spoiler guards—with zero sign-up friction and 100% offline persistence.

---

## Why CineSlate?

- **Zero Auth Friction:** Every log, rating, review, and curated list lives inside your browser's IndexedDB engine. No tracking, no paywalls, and instant response times.
- **Micro-Interaction Polish:** 10-step discrete star rating scrub (0.5 to 5.0 stars), animated orange heart likes, and interactive frequency histograms.
- **Algorithmic Data Integrity:** Atomic IndexedDB transactions reconcile rolling community rating averages, lifetime watch metrics, and list indexes without desynchronization.
- **Defensive Engineering:** XSS-sanitized Markdown parser, open-redirect protection on relative URLs, and focus-trapped accessible dialogs.
- **Mobile-First Ergonomics:** Tested across 360px, 390px, and 430px viewports with zero horizontal overflow and strict 44x44px minimum touch targets.

---

## Key Features

### 1. Ten-Point Star Rating System (0.5 to 5.0)
- SVG-based linear gradient fill for half-stars (`0.5`, `1.5`, `2.5`, `3.5`, `4.5`).
- Fluid touch scrubbing on mobile viewports with single-commit dispatch on release.
- Accessible keyboard navigation (`ArrowRight`/`ArrowUp` increments by 0.5, `ArrowLeft`/`ArrowDown` decrements by 0.5, `Delete`/`Backspace` clears).

### 2. Rating Distribution Histogram
- Dynamic 10-bar frequency visualization comparing individual ratings against community metrics.
- Active highlight for the viewer's own rating.
- Responsive mobile adaptation: full tooltips on desktop, scroll-safe inline metric line on mobile devices.

### 3. Watched Diary & Lifetime Statistics
- Chronological logging grouped by month and year.
- Filter views: Everything, Written Reviews Only, and Rewatches.
- Automated calculation of total films watched, yearly count, and cumulative watch time (days, hours, minutes).

### 4. Curated Lists & Drag-and-Drop Reordering
- Ranked and unranked list curation powered by `@dnd-kit`.
- Fractional indexing algorithm: moving an item assigns `(indexA + indexB) / 2` to execute an O(1) single-row update instead of rewriting the entire table.
- Automatic collision detection and sequence rebalancing.

### 5. Markdown Reviews & Accessible Spoiler Masks
- Closed-set Markdown compiler supporting headings, quotes, code blocks, lists, and links.
- Strips unsafe protocols (`javascript:`, `data:`) and blocks protocol-relative open-redirect vectors (`//`, `/\`, `\\`).
- Screen-reader-safe spoiler concealment with reversible click-to-reveal states.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router, Server Components + Client Islands) |
| **Runtime** | React 19 |
| **Styling** | Tailwind CSS v4 (CSS `@theme` design tokens) |
| **Storage Engine** | Dexie.js v4 (IndexedDB local-first persistence) |
| **Drag & Drop** | `@dnd-kit/core`, `@dnd-kit/sortable` |
| **Icons** | Lucide React |
| **Verification** | Headless Chromium CDP harness + Node logic test suites |

---

## Architecture

```
src/
├── app/                  # Next.js App Router routes & layouts
├── components/
│   ├── ui/               # Atomic primitives (StarRatingInput, HistogramChart, PosterImage)
│   ├── compound/         # Compound domain molecules (FilmCard, DiaryRow, QuickLogModal)
│   ├── features/         # Full page feature islands (FilmDetailPage, ListEditor)
│   └── layout/           # ClientShell, HeaderNavbar, MobileBottomNav, Footer
├── features/quick-log/   # Global quick-log orchestration provider
├── lib/
│   ├── db/               # Dexie IndexedDB schema, queries, metrics, and fixtures
│   ├── hooks/            # Reactive domain hooks (useDiaryStore, useFilmRatings)
│   └── utils/            # Math, date formatters, and Markdown sanitizer
└── types/                # Pure TypeScript domain interfaces
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/mmy-lana/cine-slate.git
cd cine-slate

# Install dependencies
pnpm install

# Start the development server
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Test Suite

The repository includes deterministic verification suites for storage, domain logic, and headless mobile rendering:

```bash
# Run all verification suites (logic, storage, types)
pnpm run verify

# Verify storage invariants and Dexie transactions
pnpm run verify:storage

# Verify rating math, date formatters, and URL sanitization
pnpm run verify:logic

# Run headless Chrome render and accessibility audit (360px - 430px viewports)
pnpm run verify:render
```

---

## License

MIT License. Developed for cinephiles and frontend systems enthusiasts.
