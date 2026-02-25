# PrivacyLens

**AI-powered privacy policy & terms of service analyzer that runs entirely in your browser.**

PrivacyLens scans any privacy policy or terms of service document and delivers an instant risk grade (A–F) with detailed category breakdowns all without sending a single byte of your data to external servers. It combines 150+ heuristic pattern rules with optional on-device LLM refinement via WebGPU.

---

## Features

- **Zero data transmission** — all analysis runs client-side in your browser
- **Instant heuristic analysis** — 150+ pattern rules derived from GDPR, CCPA, COPPA, and FTC enforcement precedents
- **On-device AI refinement** — optional WebGPU-powered LLM inference (SmolLM2 360M or Qwen 2.5 0.5B)
- **URL or paste input** — fetch any policy by URL or paste text directly
- **Six analysis categories** — Data Collection, Third-Party Sharing, User Rights, Data Retention, Security Measures, Children's Privacy
- **Advanced metrics** — readability ensemble (5 indices), vague language detection, completeness scoring, boilerplate detection, sentiment mismatch analysis
- **Dark pattern detection** — identifies manipulative language and FTC-precedent dark patterns
- **Cross-category inconsistency detection** — flags contradictions between policy sections
- **Regulatory compliance signals** — GDPR, CCPA/CPRA, COPPA references
- **Shareable reports** — share analysis results via URL-encoded links
- **Cyberpunk UI** — dark terminal aesthetic with neon accents

## How It Works

```
┌──────────────────────────┐
│     Policy Input         │  URL fetch or paste text
│  (URL / Paste / Preset)  │
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│   Heuristic Analyzer     │  150+ pattern rules, 6 categories
│   (Instant Results)      │  Readability, vagueness, completeness
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│   Scorer & Aggregator    │  Weighted scoring, red flags, grade
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│   On-Device LLM          │  Optional WebGPU inference
│   (Background Refine)    │  SmolLM2 360M / Qwen 2.5 0.5B
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│   Report & Insights      │  Grade A-F, categories, red flags,
│                          │  recommendations, share URL
└──────────────────────────┘
```

1. **Input** — provide a URL (fetched via local dev proxy) or paste policy text directly
2. **Heuristic scan** — 150+ regex/NLP pattern rules analyze six privacy categories in under 500ms
3. **Scoring** — weighted category scores produce an overall A–F grade with red flag detection
4. **LLM refinement** (optional) — an on-device small language model generates contextual summaries, threat assessments, and recommendations
5. **Report** — interactive report with category cards, advanced insights, and one-click sharing

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Preact](https://preactjs.com/) 10 (lightweight React alternative) |
| Language | TypeScript 5.9 (strict mode) |
| Build Tool | [Vite](https://vitejs.dev/) 7 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 4 |
| AI/ML | [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) (WebGPU inference) |
| Execution | Web Workers (non-blocking LLM inference) |

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- **WebGPU-capable browser** for on-device LLM features:
  - Chrome 113+ or Edge 113+ (recommended)
  - Firefox (recent versions with WebGPU enabled)
  - Safari 18+
- Hardware acceleration must be enabled in browser settings

> Without WebGPU, the heuristic analysis engine still works — LLM refinement is skipped gracefully.

## Getting Started

### Install dependencies

```bash
npm install
```

### Development server

```bash
npm run dev
```

Opens at `http://localhost:5173`. The dev server includes a local policy proxy that handles CORS for URL-based policy fetching.

### Production build

```bash
npm run build
```

Outputs optimized static files to `dist/`. TypeScript is checked before bundling.

### Preview production build

```bash
npm run preview
```

Serves the `dist/` folder locally with the policy proxy middleware active.

## Project Structure

```
src/
├── components/           UI components (Preact)
│   ├── App.tsx           Main app shell with state management
│   ├── Header.tsx        Navigation header
│   ├── PolicyInput.tsx   URL/text input form with model selector
│   ├── Report.tsx        Results display with section navigation
│   ├── ReportCard.tsx    Individual category result card
│   ├── OverallGrade.tsx  Large A-F grade display
│   ├── PolicyInsights.tsx Advanced metrics and insights panel
│   ├── LoadingScreen.tsx Progress indicator during analysis
│   ├── ShareButton.tsx   Share button with URL encoding
│   ├── ErrorBoundary.tsx Catches runtime errors with fallback UI
│   └── WebGPUCheck.tsx   Browser capability detection
├── engine/               Core analysis engines
│   ├── heuristic-analyzer.ts  150+ rule-based pattern analysis
│   ├── llm-engine.ts     On-device LLM integration (MLC-AI)
│   └── scorer.ts         Score aggregation and grading logic
├── hooks/                Custom Preact hooks
│   ├── use-llm.ts        LLM lifecycle and analysis orchestration
│   └── use-share.ts      URL sharing and report encoding
├── worker/               Web Worker for off-thread LLM
│   └── llm-worker.ts     WebWorkerMLCEngineHandler
├── types/                TypeScript type definitions
│   └── analysis.ts       All analysis interfaces and types
├── utils/                Utility modules
│   ├── scraper.ts        Policy URL fetching and HTML parsing
│   ├── grade-utils.ts    Grade/severity mapping and colors
│   ├── text-utils.ts     Word counting and token estimation
│   └── webgpu-detect.ts  WebGPU capability detection
├── styles/
│   └── main.css          Tailwind + custom cyberpunk styling
└── main.tsx              Application entry point
```

## Analysis Categories

| Category | Weight | What It Checks |
|----------|--------|---------------|
| Data Collection | 20% | Biometric, health, location, financial data; tracking pixels; profiling |
| Third-Party Sharing | 20% | Data broker sales, advertising networks, affiliates, government access |
| User Rights | 20% | Deletion rights, data access, portability, opt-out mechanisms |
| Data Retention | 15% | Indefinite storage, vague timeframes, backup persistence |
| Security Measures | 15% | Encryption claims, breach notification, audits, specific safeguards |
| Children's Privacy | 10% | COPPA compliance, parental consent, age verification |

## Grading Scale

| Grade | Score Range | Meaning |
|-------|------------|---------|
| A | 90–100 | Strong privacy protections |
| B | 75–89 | Good with minor concerns |
| C | 60–74 | Mixed — notable gaps |
| D | 45–59 | Poor privacy practices |
| F | 0–44 | Critical privacy risks |

## Advanced Metrics

- **Readability Ensemble** — Flesch-Kincaid, Gunning Fog, Coleman-Liau, ARI, and SMOG indices averaged into a composite grade level
- **Vague Language Score** — density of hedging terms ("may", "might", "reasonably") normalized against total sentences
- **Completeness Score** — cosine similarity of policy terminology against regulatory disclosure keyword sets
- **Boilerplate Detection** — percentage of template/generic language vs. customized content
- **Sentiment Mismatches** — instances of positive framing used to obscure invasive practices

## Deployment

PrivacyLens is a fully static site with no backend dependencies. Deploy the `dist/` output to any static hosting platform.

**Important:** The built-in policy proxy (for URL-based fetching) only works with the Vite dev/preview server. For production deployments, you have two options:

1. **Paste-only mode** — users paste policy text directly (no proxy needed)
2. **Custom proxy** — deploy a lightweight CORS proxy (e.g., a Cloudflare Worker or serverless function) and update the proxy route in the scraper

### Static hosting examples

```bash
# Netlify
npm run build && netlify deploy --prod --dir=dist

# Vercel
npm run build && vercel --prod

# GitHub Pages
npm run build
# Push dist/ to gh-pages branch

# Docker (static nginx)
docker build -t privacylens .
docker run -p 8080:80 privacylens
```

## Browser Support

| Browser | Version | WebGPU | Heuristic Only |
|---------|---------|--------|---------------|
| Chrome | 113+ | Yes | Yes |
| Edge | 113+ | Yes | Yes |
| Firefox | Recent | Partial | Yes |
| Safari | 18+ | Partial | Yes |
| Mobile Chrome | 113+ | Limited | Yes |

## Privacy & Security

- **No external API calls** — all computation happens in your browser
- **No telemetry or analytics** — zero tracking
- **No data storage on servers** — localStorage caching is browser-local only
- **Share URLs are client-side encoded** — report data lives in the URL hash fragment (not sent to servers)
- **Policy proxy is local-only** — blocks requests to private/internal IP ranges
- **Open source** — audit the code yourself

## License

[MIT](https://github.com/suryanarayanrenjith/PrivacyLens/blob/master/LICENSE)
