# Architecture

How the CVC Directory is put together, for someone reading the code for the first time. The README
describes each feature as a user sees it; this describes the shape underneath.

## In one paragraph

A Next.js 14 app (app router) deployed on Vercel. Every page is a thin server shell around a client
component that fetches from the app's own API with React Query. The API routes under `src/app/api`
check who's asking, validate the body with zod, and call a **store** that reads and writes **JSON
documents in Cloudflare R2** (or `./.data/` locally). There is no database, no ORM, and no cron:
anything time-based (a poll closing, a proposal's review ending) is worked out when the data is
read. Residents sign in with their name and phone number and get a signed cookie; the middleware
keeps everything else private.

## Request flow

```
browser component ──apiFetch──▶ /api/... route ──▶ lib/<feature>/http.ts (context, permissions)
   ▲  React Query                    │ readBody(zod)      │
   └── invalidate(["key"]) ◀── JSON ◀┴── lib/<feature>/store.ts ──mutateJson──▶ R2 (or .data/)
```

- `src/lib/api-client.ts` `apiFetch` throws the route's `detail` as an `Error`, so a mutation's
  `onError` can show it in a toast as it is.
- `src/lib/http.ts`: `problem(detail, status)` (RFC 9457 body), `readBody(request, schema)`,
  `throttled(request, key)`.
- Each feature's `http.ts` has a context loader (`circleContext`, `tasksContext`, `meetingsContext`,
  `wikiSession`/`pageContext`, …) returning either `{ error: NextResponse }` or what the route needs
  (user, directory, the thing, and what the user may do), plus a `<feature>Problem(reason)` that
  maps the store's failure reasons to responses.

## Storage

`src/lib/storage.ts` is the only module that talks to R2. It falls back to `./.data/` (or
`/tmp/.data` on Vercel) when the `R2_*` variables are missing, so the app runs locally with no setup.

- `readJson(key)` / `writeJson(key, value)` / `deleteJson(key)`; `readBinary`/`writeBinary` for
  files and images; `presignedDownloadUrl` for document downloads.
- **`mutateJson(key, change)`** reads with an ETag and writes only if unchanged, retrying a few
  times — safe across several server instances. The wiki, its comments and polls, presence, and
  meetings use it. **`enqueue(key, fn)`** only queues writes within one instance; older stores
  (circles, tasks, documents, forum, …) still use it and are the first candidates to migrate.
- A store keeps one key pattern, a `normalize(raw)` that tolerates old shapes, and a `mutate()`
  wrapper that returns `{ ok: true, … } | { ok: false, reason }`.

Main documents (see each store's `KEY`):

| Key | What | Store |
|---|---|---|
| `directory/directory.json`, `directory/people.json` | The imported residents, and edits made in the app | `lib/directory` |
| `circles/circles.json`, `circles/icons.json`, `circles/schedules/<id>.json` | Circles, seats, page modules; icons; duty rotations | `lib/circles`, `lib/schedules` |
| `wiki/pages.json`, `wiki/history/<pageId>.json`, `wiki/comments/<pageId>.json`, `wiki/polls.json`, `wiki/presence.json`, `wiki-images/<circleId>.json` | The one wiki | `lib/wiki`, `lib/polls` |
| `documents/index.json`, `documents/text.json`, `documents/types.json` + binaries | Documents, their extracted text, per-circle types | `lib/documents` |
| `tasks/<circleId>.json`, `task-comments/<circleId>.json` | Tasks | `lib/tasks` |
| `meetings/<circleId>.json` | Minutes and proposals (together, so an objection and the clock it pauses change in one write) | `lib/meetings` |
| `forum/index.json`, `forum/threads/<id>.json`, `forum/topics.json` | Forum | `lib/forum` |
| `photos/index.json`, `homes/listings.json`, `resources/recommendations.json`, `library/items.json`, `skills/index.json`, `appreciations/index.json`, `profiles/index.json` | The rest | one store each |
| `push/subscriptions.json`, `push/preferences.json`, `auth/*` | Devices, notification choices, accounts, sign-in log | `lib/push`, `lib/auth` |

## Who's who

- **Resident**: anyone signed in; has a `personId` from the directory. `getSessionUser()`.
- **Circle member**: holds a seat on the circle (`circle.seats[].personId`); a seat's `position`
  ("Secretary", "Op leader", …) is free text, matched with `holdsSeat(…, /secretary/i)`.
- **The Board** (`BOARD_ID`): its members can manage every circle (`canManageCircle`,
  `sitsOnBoard`). **Community** (`COMMUNITY_ID`) is everyone — no seats, can't be joined or deleted.
- **Admin**: listed in `ADMIN_PERSON_IDS` (`isAdmin`); passes every check and can "view as" someone.
- `canUploadTo(user, directory, circleId)` is the common "may change this circle's things" test:
  its members, the Board, admins — and any resident for Community.

Access logic lives in `lib/<feature>/access.ts` (pure, testable) and is applied in `http.ts`. The
API's responses carry `canEdit`/`canAdd`/`canReview`-style flags so the UI matches the server.

## Circles and their pages

A circle's page is a list of **modules** (`src/lib/circles/layout.ts`): Information (wiki pages by
a filter, any number of them), Members, Meetings, a duty schedule, Tasks (with a "who can add"
setting), Documents. `modulesFor(circle, …)` returns the saved `circle.modules`, or derives a page
from the older `layout`/`features`/`infoView` fields for circles that never saved one. Saving
modules also sets `features.tasks`/`features.documents`, which gate those APIs
(`lib/circles/features.ts`). Rendering: `components/circles/circle-modules.tsx` (`CircleModules`
for reading, `ModuleEditor` for Edit page), `circle-detail-client.tsx` `sectionFor()` maps a module
to its component.

## The wiki

One wiki for the whole community (`lib/wiki/store.ts`). Each page has a **keeper** — the field name
in code and storage; the UI calls it the **parent circle** — and its own view/edit settings
(`lib/wiki/access.ts`). Titles are unique; links are `[[Title]]`, embeds `::embed{page="…"}`
(`lib/wiki/links.ts`, `sections.ts`). Edits autosave and merge paragraph by paragraph
(`lib/wiki/merge.ts`, `mergeText(base, mine, theirs)`), with presence via `wiki/presence.json`.
Colours are `lib/wiki/colors.ts`; the map (`components/wiki/map-*.tsx`) is built by
`lib/wiki/graph.ts` from the pages the viewer can see.

## Meetings and proposals

`lib/meetings/shared.ts` holds the types and the **review clock**: a proposal sent for review gets
`deadline = now + 5 days`; an objection stores `remainingMs` and clears the deadline (paused);
withdrawing the last objection sets `deadline = now + remainingMs`; `proposalState(p, now)` reads
`consented` once the deadline passes, and the store records it (and announces it once) at the next
read or write. `lib/meetings/store.ts` has the mutations; `http.ts` the permissions (members review).

## Notifications

Web push (`lib/push`). Topics are declared once in `push/store.ts` (`TOPICS`,
`DEFAULT_PREFERENCES`) and the settings page lists them from there. `notify({ topic, title, body,
url, onlyUserIds, exceptUserId })` never throws and gives up after ~6 s. `userIdsForPeople()` turns
seats into accounts.

## Time

Everything is Vermont time: `TIME_ZONE` and `todayInVermont()` in `lib/time.ts`. Dates are
`YYYY-MM-DD` strings; timestamps are ISO. Browser-side "today" should use the server's view (an API
field) or `todayInVermont()` too, not the device's zone.

## The client

- React Query everywhere; keys: `["directory"]`, `["wiki"]`, `["wiki-page", slug]`, `["tasks", circleId]`,
  `["task", circleId, number]`, `["meetings", circleId]`, `["meeting", circleId, id]`,
  `["proposal", circleId, id]`, `["documents", …]`, `["forum", …]`, `["auth", "me"]`. Invalidate by
  prefix after a mutation.
- `components/directory/use-directory.ts`: `useDirectory()`, `useCircles()` — the shared directory
  query most pages need.
- `components/layout/back-link.tsx`: "← …" links go back to the page you came from (a trail in
  session storage), falling back to a fixed place.
- `components/layout/app-shell.tsx`: navigation; `src/app/page.tsx`: the dashboard cards.

## Testing

- `npm test` runs vitest over `src/**/*.test.ts` — pure logic (merge, review clock, modules, route
  helpers). Add a test beside anything with rules in it.
- End-to-end checks run against a real build: seed synthetic data into `.data/`, start with
  `AUTH_SECRET=local-test ADMIN_PERSON_IDS=<id> next start`, sign in through
  `POST /api/auth/login {personId, phone}`, then curl the API and drive the UI with Playwright
  (Chromium at `/opt/pw-browsers/chromium` in the cloud dev container). Keep fixtures synthetic:
  no real residents in the repo, ever.

## Glossary

| In the code | In the UI | Meaning |
|---|---|---|
| keeper | parent circle | The circle a wiki page belongs to |
| module (formerly section) | module | One block of a circle's page |
| `PAGE_COLORS` | colour | A wiki page's colour (it was "note" when pages were pinned as sticky notes) |
| `COMMUNITY_ID` / `BOARD_ID` | Community / the Board | The two built-in circles |
| tension / objection | Log a tension / Raise a Reasoned Objection | Comments on a proposal; only an objection pauses its review |
