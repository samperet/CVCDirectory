# Community Village Cooperative Directory

A mobile-first community directory for residents, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router and Tailwind CSS, with data stored as JSON documents in Cloudflare R2.

## Features

- 🔐 **Resident sign-in** – Pick your name, enter your phone number; signed-out visitors see only the sign-in page.
- 📇 **Directory** – Residents by unit with contact details, circles with open seats, and carshed allocations.
- 🛠️ **Loan Library** – Items residents lend, with lent-out tracking and an "Ask to borrow" button.
- 🌱 **Skills** – What neighbors can help with, each skill listed by the resident who offers it.
- 💬 **Forum** – Neighborhood discussions with replies nested to any depth.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page.
- 🙂 **Profiles** – Residents edit their own details and add a photo.
- 📅 **Calendar** – The next community event on the dashboard, and the full Google Calendar on its own page.
- 🌀 **Circles** – Who serves on each circle and where seats are open, with uploadable circle icons shown as badges in the directory.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A Cloudflare R2 bucket for durable storage (optional for local development)

### Environment Variables

Create a `.env.local` file using the template below:

```bash
cp .env.example .env.local
```

Storage (all app data — falls back to local `.data/` files when unset, which is ephemeral on Vercel):

- `R2_ACCOUNT_ID` – Cloudflare account ID.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` – R2 API token credentials (Object Read & Write on the bucket).
- `R2_BUCKET` – R2 bucket holding the app's documents and images.

Accounts and admin:

- `AUTH_SECRET` – Signs session cookies. Set it in production (see Signing In below).
- `ADMIN_TOKEN` – Enables the admin directory import; leave unset to disable it.
- `NEXT_PUBLIC_APP_TITLE` – Optional override for the UI title.

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

### Linting

```bash
npm run lint
```

## Signing In

Residents sign in at `/login` by choosing their name from a searchable dropdown and entering
their phone number as the password. The names come from the imported community directory — only
residents with a phone number on file can sign in — and the dropdown exposes names only, never
contact details or unit numbers.

- Formatting is ignored: `802-555-1234`, `802.555.1234`, `(802) 555 1234`, and `+1 802 555 1234`
  all match. A landline on file works too.
- Five wrong attempts lock that name for 15 minutes. Failures are tracked in the shared store, so
  the limit holds across serverless instances.
- An account is created on a resident's first sign-in and linked to their directory entry.
- Signed-out visitors see only the sign-in page: middleware redirects every other page to `/login`
  (returning afterwards to the page they asked for) and answers 401 for every other API route.

Phone numbers are not secret, so this keeps the barrier low rather than high. Session cookies are
signed with `AUTH_SECRET`; when it's unset, production derives a key from `R2_SECRET_ACCESS_KEY`
(never the public development default), and with neither it refuses to create sessions. Setting
`AUTH_SECRET` explicitly is still recommended.

## Forum & Appreciations

- **Forum** (`/forum`) – signed-in members start discussions and reply to any post; replies nest
  to any depth (indentation stops at five levels so long chains stay readable on phones) and any
  branch can be collapsed. Authors can edit and delete their own posts; deleting a reply that
  others answered leaves a placeholder so the conversation below survives, and a discussion can be
  deleted by its author only while no one else has replied. Each thread is one JSON document (`forum/threads/<id>.json`) with
  replies stored flat by `parentId`, plus an index (`forum/index.json`) for the list page.
- **Appreciations** – signed-in members share short public thank-you notes, optionally addressed
  to someone. They rotate through the footer of every page (pausable, and not auto-advancing for
  visitors who prefer reduced motion). Stored in `appreciations/index.json`, newest 500 kept.

Authors always come from the signed-in session, never from the request body.

## Directory & Skills

- **Directory** (`/directory`) – residents grouped by unit with phone, landline, email, and
  birthday; circles with their seats and open positions; and carshed allocations. Served by
  `GET /api/directory` to signed-in residents only (the route confirms the account server-side).
- **Skills** (`/skills`) – every skill belongs to the resident who lists it, taken from their
  signed-in account. Residents add and remove only their own; the catalog groups skills by
  category and shows who offers each one. Stored in `skills/index.json`.
- **Loan Library** (`/library`) – things residents are happy to lend. Every item belongs to the
  resident who lists it; only they can mark it lent out (optionally noting who has it), returned,
  or remove it. Others see an "Ask to borrow" button that emails (or calls) the owner using their
  directory contact details. Stored in `library/items.json`.

## Storage

JSON documents are stored in Cloudflare R2 via the S3-compatible API. Without R2 credentials — or
if R2 is unreachable — the app falls back to `.data/` on disk: fine for local development,
ephemeral on Vercel. `GET /api/health` reports `{ storage: { configured, durable } }` (booleans
only) and returns 503 unless writes are actually reaching R2.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

## Circles

`/circles` lists each circle from the imported directory with its members (current names and
photos), roles, terms, and open seats. Each circle can have an uploaded icon — changeable by that
circle's members or the Board, so empty circles can get one too — stored as a binary object
(`circles/icons/<id>`, metadata in `circles/icons.json`) and served only to signed-in residents.
In the directory, residents show the icons of the circles they serve on as badges, labelled with
their role.

## Profiles & Calendar

- **Profiles** (`/profile`) – residents edit their own name, email, phone numbers, birthday, and a
  short bio, and upload a photo. Edits live in `profiles/index.json`, separate from the imported
  sheet, and are layered over it wherever resident data is read, so a re-import never wipes them.
  Unit and owner/renter stay as imported. Because phone numbers are passwords, changing one
  requires the current number, and at least one must remain. Photos are center-cropped and
  downscaled in the browser, verified server-side by their bytes (JPEG, PNG, or WebP, up to 1 MB),
  stored in `profiles/photos/`, and served only to signed-in residents.
- **Community calendar** – the dashboard shows the next event, read server-side from the calendar's
  public iCal feed (cached 15 minutes) with recurring events expanded — honouring cancelled dates
  and one-off changes — and all-day dates anchored to Eastern time. `/calendar` embeds the full
  Google Calendar (month view on wide screens, agenda on phones) with a link to add it.

## Community Directory Import

`PUT /api/admin/directory` imports residents, circles, and carshed allocations into R2 as one
document. It requires `Authorization: Bearer $ADMIN_TOKEN` (disabled when `ADMIN_TOKEN` is unset),
writes to R2 only — never to the ephemeral fallback — and responds with counts only. The directory
holds residents' contact details, so exports are gitignored and only signed-in residents can read it.

## Deployment

- The project is configured for Vercel serverless deployment.
- Configure the `R2_*` variables and `AUTH_SECRET` in Vercel project settings (see above).
- Environment variables apply to new deployments, so redeploy after changing them.

## Project Structure

```
src/
  app/           # Next.js App Router routes
  components/    # Reusable UI and feature components
  lib/           # Storage (R2), auth, feature stores, utilities
  middleware.ts  # Sends signed-out visitors to the sign-in page
```

## Testing Notes

- The repository uses React Query for optimistic updates.
- API endpoints follow RESTful patterns with JSON problem details on error.
- Rate limiting is intentionally lightweight and in-memory; adjust for production as needed.

## License

MIT
