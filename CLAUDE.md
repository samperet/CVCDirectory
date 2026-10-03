# Working on Common Pastures (the CVC Directory)

Notes for anyone — person or AI — picking this codebase up. The longer tour is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the feature-by-feature reference is the README.

## What it is

A private web app for the residents of CVC (a cohousing community in Vermont): directory, circles
(sociocratic working groups), a wiki, documents (pages, including meeting notes, and files), tasks, forum, loan library,
calendar, photos. Next.js 14 (app router, TypeScript, Tailwind) on Vercel; **all data is JSON and
files in Cloudflare R2** — there is no database. Refer to the community only as **CVC**.

## Commands

```
npm run dev          # local server (data in ./.data/ unless R2_* env vars are set)
npm run check        # lint + typecheck + unit tests — run before pushing
npm test             # vitest: src/**/*.test.ts (pure logic in src/lib)
npm run format       # prettier (printWidth 100); the whole of src/ is formatted
npm run build        # what Vercel runs
```

Locally, sign in needs `AUTH_SECRET` and a seeded `.data/directory/directory.json`; make yourself an
admin with `ADMIN_PERSON_IDS=<your person id>`. `.env.example` lists every variable.

## Where things live

| Path | What |
|---|---|
| `src/app/<section>/page.tsx` | A page: a thin server shell that renders a client component |
| `src/app/api/**/route.ts` | The API. Each handler: context/permission helper → `readBody` → store → JSON |
| `src/components/<feature>/` | Client components, grouped by feature; `ui/` holds the primitives |
| `src/lib/<feature>/shared.ts` | Types and pure helpers safe for the browser |
| `src/lib/<feature>/store.ts` | Reading and writing that feature's JSON (server only) |
| `src/lib/<feature>/access.ts` | Who may do what (pure predicates) |
| `src/lib/<feature>/http.ts` | Route helpers: the feature's context loader and failure → `problem()` |
| `src/lib/storage.ts` | R2 (or `.data/`): `readJson`, `writeJson`, `mutateJson`, binaries |
| `src/lib/http.ts` | `problem`, `readBody`, `throttled`, `notFound`/`forbidden`/`full` — every route uses these |
| `src/lib/auth/actor.ts` | `Actor` (`userId`, `personId`, `name`, `admin`) and `actorOf(user)`: who is acting, as stores see them |
| `src/lib/comments/` | The one comment system: `CommentRecord` (`shared.ts`) and the add/edit/delete rules (`store.ts`) every feature's comments follow |
| `src/components/comments/` | `CommentTree`, `CommentForm`, `CommentByline` — how comments are shown everywhere |
| `src/components/ui/` | The primitives: `Pill`, `SectionHeading`, `SegmentedControl`, `Loading`/`ErrorCard`/`NotFoundCard`, `Select`, `ActionLink`, `Dialog`, and `useConfirm()` |
| `src/lib/circles/types.ts` | `Circle`, `CircleSeat`, `CircleApplication`, `CircleKind`, `JoinPolicy` |
| `src/lib/text.ts` | `sentence`, `initials`, `listNames`, `likedByLabel` |
| `src/lib/circles/ids.ts` | `COMMUNITY_ID`, `BOARD_ID`, `isCommunity`, `sitsOnBoard` (importable anywhere) |
| `src/lib/time.ts` | `TIME_ZONE` (Vermont), `todayInVermont`, `timeAgo` |

## Conventions that matter

- **Every write goes through `mutateJson(key, change)`** (an R2 conditional put with retries) so two
  Vercel instances can't overwrite each other. `change` is synchronous and may run more than once:
  no I/O inside it, and return `{ write: false }` when nothing changes. `enqueue` is only for deletes.
- **Who is acting is an `Actor`** (`actorOf(user)` or `ctx.actor`); stores take `Pick<Actor, …>` and
  never store it whole. Each store exports its `Failure` union; the feature's `<feature>Problem()`
  maps it to responses.
- **Comments** on anything use `lib/comments` and `components/comments`, never a new shape.
- **Confirmations** use `useConfirm()` from `components/ui/confirm.tsx`, never `window.confirm`;
  pages show `Loading`, `ErrorCard` and `NotFoundCard` from `components/ui/status.tsx`.
- **Permissions are decided on the server**, in the feature's `access.ts`/`http.ts`; the API tells
  the client what it may do (`canEdit`, `canAdd`, …) and components only hide or show controls.
- **Admins** are `ADMIN_PERSON_IDS` (`isAdmin`); **the Board** can manage every circle
  (`canManageCircle`, `sitsOnBoard`); **Community** is everyone and has no members.
- **React Query**: one query per resource with a small factory (`directoryQuery`, `wikiPagesQuery`,
  `tasksQuery`…). Mutations invalidate by key prefix; `["directory"]` is the
  people-and-circles document most pages read — use `useDirectory()`/`useCircles()`.
- **Time** is Vermont time everywhere (`TIME_ZONE`); dates are `YYYY-MM-DD` strings.
- **Comments at the top of each file** say what it is for and the rules it enforces; keep them
  true when you change behaviour. Prose in the UI and comments is plain English.
- Circle pages are built from **modules** (`src/lib/circles/layout.ts`); wiki pages have a
  **keeper** in the code, called the **parent circle** in the UI.

## Adding things

- **A field or rule**: change the zod schema in `store.ts`, the store function, then the UI. Types
  flow from `shared.ts`/`types.ts`.
- **A route**: copy the shape of a neighbour — `export const dynamic = "force-dynamic"`, a context
  helper, `throttled` on writes, `readBody`, a store call, `NextResponse.json` or `problem`.
- **A circle module type**: `MODULE_TYPES`/`MODULE_NAMES` in `layout.ts`, `MODULE_ICONS`/hints and
  the offered list in `components/circles/module-dialogs.tsx`, a case in `sectionFor` in
  `circle-detail-client.tsx`.
- **A notification topic**: `TOPICS` in `src/lib/push/topics.ts`, `DEFAULT_PREFERENCES` in
  `src/lib/push/store.ts` and `DEFAULT_EMAIL_PREFERENCES` in `src/lib/email/shared.ts`; send with
  `notify()` (push, and email for those who chose it).
- **Comments on something new**: extend `CommentRecord` with the feature's fields, call
  `addComment`/`editComment`/`deleteComment` from the store's `mutate()`, map `normalizeComment` over
  what's read, and render with `CommentTree`.
- **A label, a heading, a choice of two or three**: `Pill`, `SectionHeading`, `SegmentedControl` —
  don't hand-roll the classes again.

## Rules

- **Never commit resident data.** `.data/`, `directory.json` exports and anything naming households
  are gitignored; test fixtures use the synthetic people (Ada Ash, Ben Birch, …).
- Never decrypt or print secrets; log shapes and lengths. Never disable TLS verification.
- Production data changes only when asked, with a backup taken first; one-off admin endpoints are
  removed again after use.
- Test with `npm run check`, then a real `next build` + `next start` against seeded `.data/` for
  API (curl) and browser (Playwright) checks — see `docs/ARCHITECTURE.md` → Testing.
