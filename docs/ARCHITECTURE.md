# Architecture

How Common Pastures (the CVC community app) is put together, for someone reading the code for the first time. The README
describes each feature as a user sees it; this describes the shape underneath.

## In one paragraph

A Next.js 14 app (app router) deployed on Vercel. Every page is a thin server shell around a client
component that fetches from the app's own API with React Query. The API routes under `src/app/api`
check who's asking, validate the body with zod, and call a **store** that reads and writes **JSON
documents in Cloudflare R2** (or `./.data/` locally). There is no database, no ORM, and no cron:
anything time-based (a poll closing) is worked out when the data is
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
  `throttled(request, key)`, and the wording helpers `notFound(what)`, `forbidden(detail)`,
  `full(detail)`.
- Each feature's `http.ts` has a context loader (`circleContext`, `tasksContext`,
  `wikiSession`/`pageContext`, …) returning either `{ error: NextResponse }` or what the route needs
  (user, `actor`, directory, the thing, and what the user may do), plus a `<feature>Problem(reason)`
  that maps the store's exported `Failure` union to responses. Routes without a context helper
  build the actor with `actorOf(user)`.
- Image uploads (profile and home photos, circle icons, wiki and gallery photos) are the raw
  request body, read with `readImageUpload(request, { maxBytes, label })` in `lib/images.ts`.

## Storage

`src/lib/storage.ts` is the only module that talks to R2. It falls back to `./.data/` (or
`/tmp/.data` on Vercel) when the `R2_*` variables are missing, so the app runs locally with no setup.

- `readJson(key)` / `writeJson(key, value)` / `deleteJson(key)`; `readBinary`/`writeBinary` for
  files and images; `presignedDownloadUrl` for document downloads.
- **`mutateJson(key, change)`** reads with an ETag and writes only if unchanged, retrying a few
  times — safe across several server instances. **Every store writes through it.** `change` is
  synchronous and may run more than once, so it does no I/O; a no-write result is `{ write: false }`.
  `readOrSeedJson(key, parse, seed)` writes a first version only if none exists (the circles seed).
  **`enqueue(key, fn)`** only queues within one instance and remains around deletes and the VAPID
  keys. A binary beside an index (a photo, a wiki image, a document's file) is written first and
  taken back if the index refuses it.
- A store keeps one key pattern, a `normalize(raw)` that tolerates old shapes, an exported
  `Failure` union, and a `mutate()` wrapper that returns `{ ok: true, … } | { ok: false, reason }`.

Main documents (see each store's `KEY`):

| Key | What | Store |
|---|---|---|
| `directory/directory.json`, `directory/people.json` | The imported residents, and edits made in the app | `lib/directory` |
| `circles/circles.json`, `circles/icons.json`, `circles/schedules/<id>.json` | Circles, seats, page modules; icons; duty rotations | `lib/circles`, `lib/schedules` |
| `wiki/pages.json`, `wiki/history/<pageId>.json`, `wiki/comments/<pageId>.json`, `wiki/polls.json`, `wiki/presence.json`, `wiki-images/<circleId>.json` | The one wiki | `lib/wiki`, `lib/polls` |
| `documents/index.json`, `documents/text.json`, `documents/types.json` + binaries | Documents, their extracted text, per-circle types | `lib/documents` |
| `tasks/<circleId>.json`, `task-comments/<circleId>.json` | Tasks | `lib/tasks` |
| `logs/<circleId>.json` | Circle logs: short updates and replies, never notified | `lib/log` |
| `forum/index.json`, `forum/threads/<id>.json`, `forum/topics.json` | Forum | `lib/forum` |
| `photos/index.json`, `homes/listings.json`, `resources/recommendations.json`, `library/items.json`, `skills/index.json`, `appreciations/index.json`, `profiles/index.json` | The rest | one store each |
| `push/subscriptions.json`, `push/preferences.json`, `auth/*` | Devices, notification choices, accounts, sign-in log | `lib/push`, `lib/auth` |
| `email/settings.json`, `email/preferences.json`, `email/log.json`, `email/quota.json`, `email/inbound-log.json`, `email/inbound/<id>.json` | Test mode and allowed addresses, each person's email choices, recent sends, the free-plan count, received email | `lib/email`, `lib/groups/inbound.ts` |
| `groups/<circleId>/index.json`, `groups/<circleId>/threads/<id>.json`, `groups/<circleId>/polls/<id>.json`, `groups/<circleId>/held.json`, `groups/delivery.json`, `groups/aliases.json`, `groups/summary.json` | Circle email groups: conversations, polls, held messages, delivery choices, old addresses, the morning summary queue | `lib/groups` |

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

Who is acting reaches a store as an **`Actor`** (`lib/auth/actor.ts`: `userId`, `personId`,
`name`, `admin`), built once by `actorOf(user)` or a context helper; a store takes the fields it
needs (`Pick<Actor, "userId" | "admin">`), so ownership checks read the same everywhere, and what it
writes down about who did something (`createdBy`, `uploadedBy`, `proposer`) is picked out field by
field — `admin` is never stored. The circle types (`Circle`, `CircleSeat`, …) are in
`lib/circles/types.ts`; the rest of the directory's in `lib/directory/types.ts`.

## Comments

Tasks, wiki pages, forum discussions (their replies) and recommendations all use one
comment system. `lib/comments/shared.ts` has the record (`CommentRecord`: `parentId`,
`authorId`/`authorPersonId`/`authorName`, `body`, `editedAt`, `deletedAt`) and the grouping
helpers; `lib/comments/store.ts` has the rules as pure list operations — `addComment` (nesting
"none", "one" or "any", a limit, and `among` when one document holds several things' comments),
`editComment` and `deleteComment` (the author or a moderator; a comment with replies becomes a
placeholder, pruned once nothing hangs off it). Each feature's store applies them to its own
document and adds its own fields (a wiki comment's quote, a reply's
likes); `normalizeComment` fills in what older records lack as they are read.
`components/comments` shows them: `CommentTree` (replies, folding, edit and delete with the Confirm
dialog, `#comment-<id>` links), `CommentForm`, `CommentByline`; features pass what differs
(`renderBody`, `renderExtras`, `renderActions`).

## Circles and their pages

A circle's page is a list of **modules** (`src/lib/circles/layout.ts`): Information (wiki pages by
a filter, any number of them), Members, a duty schedule, Tasks (with a "who can add"
setting), Documents (the circle's pages and files). `modulesFor(circle, …)` returns the saved `circle.modules`, or derives a page
from the older `layout`/`features`/`infoView` fields for circles that never saved one. Saving
modules also sets `features.tasks`/`features.documents`, which gate those APIs
(`lib/circles/features.ts`). Rendering: `components/circles/circle-modules.tsx` (`CircleModules`
for reading, `ModuleEditor` in the circle's Edit mode, which also edits its details), `circle-detail-client.tsx` `sectionFor()` maps a module
to its component.

## The wiki

One wiki for the whole community (`lib/wiki/store.ts`). Each page has a **keeper** — the field name
in code and storage; the UI calls it the **parent circle** — and its own view/edit settings
(`lib/wiki/access.ts`). Titles are unique; links are `[[Title]]`, embeds `::embed{page="…"}`
(`lib/wiki/links.ts`, `sections.ts`). Edits autosave and merge paragraph by paragraph
(`lib/wiki/merge.ts`, `mergeText(base, mine, theirs)`), with presence via `wiki/presence.json`.
Highlighted words are `:mark[…]{color="…"}` (palette in `lib/wiki/colors.ts`, drawn as `<mark>` by
`lib/wiki/directives.ts` and edited by `markDirective` in `rich-editor.tsx`); the map (`components/wiki/map-*.tsx`) is built by
`lib/wiki/graph.ts` from the pages the viewer can see. A page is shown as a document
(`components/wiki/wiki-page.tsx`: the keeper's icon, title, date and consent in a centred header
over a `.document-sheet` with `.document-body` margins); the editor (`wiki-editor.tsx`) has a
sticky title bar with the save state and the page's settings, and the toolbar sticks under it.
A page's **consent** (`lib/wiki/consent.ts`, `page.consent`) is the keeper circle's, recorded with
a date (`PATCH {consent: {date}}`, or `null` to withdraw) against the version current then;
`consentState()` reads "changed" once the page is edited again. A page's **stage**
(`pageStage()`: draft, proposed, consented) adds `page.proposal` (`PATCH {proposal: {decideOn}}`, or
`null`; its editors), which recording consent clears — a proposal is a page waiting for consent. Who may record it is the same for
pages and files: `canRecordConsent` (`lib/circles/consent.ts`) — anyone in the circle, the Board for
any circle, admins.

Pages and uploaded files share one **Documents** section (`/documents`; `/wiki` redirects there).
`GET /api/documents?pages=1` returns both as `items` (`kind` "page" | "file"; pages listed by
`lib/wiki/listing.ts`, searched and sorted like files), shown by `DocumentsPanel` with
`PageListingRow` and `DocumentRow`, and its **New** menu (`documents/new-menu.tsx`) writes a page
or uploads a file. Storage, links and history stay separate. **Turn into a page**
(`POST /api/documents/<id>/page`) converts a file's text with `lib/documents/to-markdown.ts`.

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
  `["task", circleId, number]`, `["documents", …]`, `["forum", …]`, `["auth", "me"]`. Invalidate by
  prefix after a mutation.
- `components/directory/use-directory.ts`: `useDirectory()`, `useCircles()` — the shared directory
  query most pages need.
- `components/layout/back-link.tsx`: "← …" links go back to the page you came from (a trail in
  session storage), falling back to a fixed place.
- `components/layout/app-shell.tsx`: navigation; `src/app/page.tsx`: the dashboard cards.
- `components/ui` holds the primitives every page is built from: `Button`, `Card`, `Input`,
  `Textarea`, `Select`, `Dialog`, `Pill` (status and count labels), `SectionHeading` (icon, title,
  count, a module's fold toggle), `SegmentedControl` (a radio group or tab list of pills),
  `Loading`/`ErrorCard`/`NotFoundCard` (the three page states), `ActionLink`, and the **Confirm
  dialog**: `useConfirm()` returns `confirm({ title, body?, destructive? }) => Promise<boolean>` —
  nothing uses `window.confirm`.
- Small text helpers live once: `lib/text.ts` (`sentence`, `initials`, `listNames`,
  `likedByLabel`), `lib/time.ts` (`timeAgo`, `shortDate`).
- A page's component stays about its layout and data; its pieces live beside it in their own
  files (`documents/document-row.tsx`, `circles/members-module.tsx`, `wiki/markdown-pane.tsx`,
  `forum/opening-post.tsx`, `resources/recommendation-card.tsx`, …).

## Testing

- `npm test` runs vitest over `src/**/*.test.ts` — pure logic (merge, review clock, modules, route
  helpers, the comment rules). Add a test beside anything with rules in it.
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
| `HIGHLIGHT_COLORS` / `:mark[…]` | highlight | Coloured words in a wiki page (pages themselves no longer have colours) |
| `COMMUNITY_ID` / `BOARD_ID` | Community / the Board | The two built-in circles |
