# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                # Astro dev server (warmup by default)
MODE=cooldown npm run dev  # cooldown variant
npm run build              # static build to dist/
npm run preview            # serve built dist/
npm run check              # astro check (TS + .astro)
```

There is no test suite, no lint script, and no single-file runner — `astro check` is the only automated gate.

## Architecture

Static Astro 5 site built twice daily by GitHub Actions (`.github/workflows/build.yml`) and deployed to GitHub Pages. All "fetching" happens at **build time** in page frontmatter; the deployed artifact is plain HTML/CSS.

### The two-mode build

The site has two builds per day, distinguished by the `MODE` env var (`warmup` | `cooldown`). The Actions workflow sets it from the cron schedule (`0 8 * * *` → warmup, `0 20 * * *` → cooldown) or from a `workflow_dispatch` input. Locally, `MODE` defaults via UTC hour in `src/lib/mode.ts`.

Mode flows top-down: `getModeMeta()` in `src/pages/index.astro`, then each widget chooses framing (e.g. calendar shows "Today" vs "Tomorrow", briefing prompt becomes forward-looking vs retrospective). Any new widget should consult `mode` rather than re-deriving from time.

### Page → widget → fetcher

`src/pages/index.astro` is the single page. It:
1. Loads `src/config.yaml` via `loadConfig()` (parsed once, cached).
2. Builds `fallback` from `src/lib/sample-data.ts`.
3. Runs all independent data fetchers in `Promise.all` — never serially.
4. Runs `fetchBriefing` **after** the parallel batch because it summarizes the rest.
5. Merges each fetcher's result into `data` using `result ?? fallback.<widget>` — every fetcher must return `null` (not throw) on failure so the page still renders.
6. Passes `data` into one `<Widget>` per section in `src/components/`.

Fetchers live in `src/data/<widget>.ts` and own their own HTTP, parsing, timeouts, and User-Agent string. They depend only on plain inputs (config slice, env var, mode) — never on Astro globals. Type contracts are in `src/lib/sample-data.ts`.

### Config split

- **Non-secret, user-editable** → `src/config.yaml` (location, team IDs, RSS list, news caps). Imported as a raw string via Vite's `?raw` and parsed by `yaml`.
- **Secrets** → env vars, read directly from `process.env` in frontmatter or fetchers: `MW_API_KEY`, `CAL_ICS_URLS`, `ANTHROPIC_API_KEY`, `GH_DASHBOARD_PAT`. Each fetcher must degrade gracefully when its var is absent.

### Styling

Single global stylesheet inside `src/layouts/Newsprint.astro` (a newsprint aesthetic — serif, double rules, red accent). Components emit semantic class names that hook into that stylesheet; avoid per-component `<style>` blocks unless the rules are genuinely local.

## Conventions

- TypeScript is strict (`astro/tsconfigs/strict`). Don't loosen it.
- Fetcher failures log via `console.warn("[widget] ...")` and return `null`. The page handles the fallback — don't bake sample data into a fetcher.
- Briefing uses `claude-haiku-4-5-20251001` with an ephemeral cache_control on the system prompt; keep it cached since the system prompt is large and stable.
- Don't add new top-level pages — this is intentionally a one-page dashboard.
