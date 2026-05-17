# Dashboard

A personal daily dashboard. Static Astro site, rebuilt twice a day by
GitHub Actions, deployed to GitHub Pages, gated by Cloudflare Access.

## Editions

The site rebuilds twice daily in two distinct modes:

| Mode | Cron (UTC) | ET (EDT)  | ET (EST)  | Vibe                              |
|------|------------|-----------|-----------|-----------------------------------|
| Warm Up   | `0 8 * * *`  | 4:00 am | 3:00 am | What's ahead today.               |
| Cool Down | `0 20 * * *` | 4:00 pm | 3:00 pm | What happened, what's next.       |

The active mode is derived from the cron schedule that triggered the build,
exposed to Astro as the `MODE` env var, and read at build time by
`src/lib/mode.ts`. Each widget keys off it to choose between
"today/last night" vs "this evening/tomorrow" framings.

To trigger a build manually, use **workflow_dispatch** in the Actions UI
and pick a mode.

## Local dev

```bash
npm install
npm run dev               # warmup by default
MODE=cooldown npm run dev # cooldown variant
npm run build             # produces dist/
```

## Project layout

```
src/
  layouts/Newsprint.astro   # global typography & rules
  components/*.astro        # one per widget
  lib/mode.ts               # MODE + date helpers
  lib/sample-data.ts        # dummy data (will be replaced by real fetchers)
  pages/index.astro         # composes the page
.github/workflows/build.yml # two-cron schedule + pages deploy
designs/                    # the five original design mocks
```

## What's wired vs what's stubbed

- ✅ Two-mode build (warmup / cooldown)
- ✅ Newsprint design ported to Astro
- ✅ GitHub Actions schedule + Pages deploy
- ⏳ Real data fetchers (weather, calendar, GitHub PRs, sports, news,
  curiosity, AI briefing) — all currently filled with `sample-data.ts`

Fetchers will be added one widget at a time. Each will live in
`src/data/<widget>.ts`, exposing an async function called from the
page frontmatter and parallelized with `Promise.all`.

## Going live

1. Push to `main`.
2. **Repo Settings → Pages → Source: GitHub Actions.**
3. First scheduled or manual workflow run deploys.
4. **Custom subdomain (optional):**
   - Add a CNAME file at `public/CNAME` containing your subdomain.
   - Point a DNS CNAME record at `<your-user>.github.io`.
   - In Cloudflare, add an **Access Application** for that subdomain
     gated by your email/identity.
5. Set the secrets that future fetchers will need under
   **Repo Settings → Secrets and variables → Actions**:
   - `ANTHROPIC_API_KEY` (briefing)
   - `GH_DASHBOARD_PAT` (cross-repo PR queries)
