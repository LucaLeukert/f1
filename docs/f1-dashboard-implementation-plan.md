# F1 Dashboard + Long Run Analyzer — Client-Only Implementation Plan

## 1) Product goal (personal-use)
Build a **private, client-only F1 dashboard** that runs entirely in the browser and can be hosted as static files.

Core goals:
- **Session exploration** (season, event, session)
- **Historic lap/stint analytics**
- **In-depth Long Run Analyzer** for FP sessions
- **Zero custom server** (no backend/API/database required)

Because this is only for personal use, optimize for:
- low maintenance
- low hosting cost
- fast iteration

---

## 2) Scope (MVP → v2)

### MVP
1. Session selector (season, GP, session)
2. Driver lap table with stint segmentation
3. Long run detection + visualization:
   - stint start/end
   - tyre compound
   - lap-time degradation slope
4. Team comparison view (e.g. McLaren / Red Bull / Ferrari)
5. CSV export of analyzed stints
6. Local cache in browser (IndexedDB/localStorage)

### v2
1. "Near-live" refresh with client polling (when data source allows CORS)
2. Weather/track condition overlay from public endpoints
3. Outlier labeling (traffic/yellow/invalid)
4. Confidence score + model explainability panel
5. Race simulation projection using best long runs

---

## 3) Client-only architecture (no server)

## Frontend stack
- **Next.js static export** OR **Vite + React + TypeScript**
- **Tailwind CSS + shadcn/ui**
- **TanStack Query** for request lifecycle + cache control
- **Recharts or ECharts** for analytics visualization
- **Dexie (IndexedDB)** for local persistent data cache

## Data flow (browser only)
1. Browser fetches source data directly from allowed public endpoints/files
2. Normalization runs in-browser
3. Long run analytics run in-browser
4. Results cached in IndexedDB
5. UI reads from cache instantly; background refresh updates deltas

## Processing strategy
- Use **Web Workers** for heavy analytics (regression, outlier filtering)
- Keep main thread responsive for charts/tables

---

## 4) Data acquisition strategy (client-safe)

I could not access the referenced GitHub repository from this environment, so details from it could not be read directly.

For client-only mode, use a pluggable browser provider layer:
- `getSeasons()`
- `getEvents(season)`
- `getSessions(event)`
- `getLaps(session)`
- `getTyreStints(session)`
- `getTrackStatus(session)`

### Important constraints
- Source must allow direct browser requests (CORS).
- If an endpoint blocks CORS, use one of these no-server alternatives:
  1. periodic static JSON snapshots committed to repo
  2. object storage JSON (public read)
  3. manual import (CSV/JSON upload in UI)

For personal use, a hybrid works best:
- direct fetch when possible
- fallback to static snapshots for reliability

---

## 5) Browser data model

In-memory entities (also persisted to IndexedDB):
- `seasons`
- `events`
- `sessions`
- `drivers`
- `teams`
- `laps`
- `stints`
- `longRunMetrics`

Suggested local stores:
- `raw_sessions`
- `raw_laps`
- `normalized_stints`
- `analytics_long_runs`
- `metadata_sync_state`

Cache key pattern:
- `${season}_${eventId}_${sessionId}_${providerVersion}`

---

## 6) Long Run Analyzer design (in-depth)

In der Formel 1 ist ein Longrun eine Serie von Rennrunden in freien Trainings, um Rennpace, Konstanz und Reifenabbau unter realistischeren Bedingungen (mehr Sprit, längere Stints) zu simulieren.

### 6.1 Long run detection
A stint is considered a long run if:
- minimum clean consecutive laps (default `>= 8`)
- constant tyre compound
- no pit-in/pit-out inside analyzed window
- excludes prep/cooldown laps via heuristics

### 6.2 Lap cleaning rules
Exclude laps with:
- invalid lap flag
- yellow/VSC/SC impact
- robust outlier threshold (`median + 2.5 * MAD`)

### 6.3 Metrics per long run
1. **Representative pace**: trimmed mean (drop top/bottom 10–15%)
2. **Tyre degradation**: robust linear regression, output `ms/lap`
3. **Consistency**: stddev + IQR
4. **Phase split**: early/mid/late pace deltas
5. **Team aggregate**: confidence-weighted mean over drivers

### 6.4 Optional fuel correction
- Track-specific fuel offset per lap (estimated)
- Must be toggleable and clearly labeled as modeled assumption

### 6.5 Confidence score (0–100)
Weighted by:
- cleaned lap count
- variance stability
- interruption contamination
- stint completeness

### 6.6 Team interpretation lens
Focus output text specifically on tyre behavior patterns like:
- "low degradation + tight variance" (race-strong, e.g. typical McLaren/Red Bull pattern)
- "higher slope + late-stint drop" (possible Ferrari-style high degradation scenarios)

---

## 7) UI/UX plan

Routes/pages:
1. `/dashboard`
   - weekend overview + quick team deltas
2. `/session/[sessionId]`
   - lap table + stint timeline
3. `/long-run`
   - cross-session comparison
4. `/long-run/[sessionId]`
   - deep dive for one FP session
5. `/import`
   - manual JSON/CSV upload for no-CORS fallback

Main charts:
- lap time vs lap number (stint lines)
- degradation slope comparison
- consistency scatter (stddev vs pace)
- team aggregate ranking

---

## 8) Infra requirements (client-only)

## Required
- **Static hosting only**: Vercel static, Netlify, GitHub Pages, Cloudflare Pages

## Optional (still no custom server)
- **Object storage** for static JSON snapshots (S3/R2/GCS public bucket)
- **CDN cache headers** for fast global loading
- **Error tracking**: client-side Sentry

## Not required
- No backend server
- No managed database
- No Redis
- No job worker/queue

---

## 9) Build & deploy plan

### Phase 0 (1 day)
- scaffold frontend + charts + local storage layer
- define provider interface + mock data

### Phase 1 (2–3 days)
- implement session/lap/stint loading in browser
- build session view + base charting

### Phase 2 (2–3 days)
- implement long run detection + cleaning + metrics in Web Worker
- build long-run deep-dive view

### Phase 3 (1–2 days)
- add team aggregation + confidence + CSV export
- polish performance and UX

### Phase 4 (ongoing)
- add optional static snapshot pipeline and better model calibration

---

## 10) Acceptance criteria

MVP is complete when:
1. App runs fully from static hosting with no backend dependencies.
2. At least one FP session can be analyzed end-to-end in-browser.
3. Long run table shows pace, degradation, consistency, confidence.
4. Team comparison highlights tyre management differences.
5. Reload uses local cache and feels fast.

---

## 11) Immediate next tasks

1. Choose runtime: **Vite React** (leanest) or **Next.js static export**.
2. Select source(s) that allow browser CORS access.
3. Implement provider interface + local cache schema.
4. Build Web Worker long-run engine.
5. Ship first `/long-run/[sessionId]` view with CSV export.
