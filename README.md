# Community Village Cooperative Directory

A mobile-first community directory for members, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router, Tailwind CSS, shadcn-inspired primitives, Prisma, and Vercel Postgres.

## Features

- 📇 **Members** – Inline editable directory with CSV import/export and detailed drawer for skills, loan items, and circle memberships.
- 🌀 **Circles** – Sociocratic hierarchy management with primary/delegate link validation and visual relationship diagram.
- 🛠️ **Loan Library** – Searchable inventory with optimistic availability toggles.
- 🌱 **Skills Catalog** – Filterable skill bank with member contact information.
- ⚡ **Optimistic UI** – React Query mutations with toast feedback and rollback handling.
- 🛡️ **Validated APIs** – Next.js route handlers with Zod schemas, rate limiting, and Prisma enforcement.
- 💬 **Forum** – Neighborhood discussions with replies nested to any depth.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A Vercel Postgres database (or any PostgreSQL-compatible connection string)

### Environment Variables

Create a `.env.local` file using the template below:

```bash
cp .env.example .env.local
```

Required variables:

- `DATABASE_URL` – PostgreSQL connection string (e.g., Vercel Postgres).
- `NEXT_PUBLIC_APP_TITLE` – Optional override for the UI title.

Optional (forum, appreciations & community accounts — falls back to a local `.data/` JSON file when unset):

- `R2_ACCOUNT_ID` – Cloudflare account ID.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` – R2 API token credentials (Object Read & Write on the bucket).
- `R2_BUCKET` – R2 bucket name that holds the JSON documents (`forum/`, `appreciations/`, `auth/`, `directory/`).

Community accounts (name + phone-number sign-in):

- `AUTH_SECRET` – Secret used to sign session cookies. **Set this in production**; without it a public fallback secret is used and sessions can be forged.

### Installation

```bash
npm install
```

### Database Setup

Generate the Prisma client and apply migrations:

```bash
npx prisma migrate dev
npx prisma db seed
```

For production (e.g., on Vercel), use:

```bash
npm run db:migrate
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
  branch can be collapsed. Each thread is one JSON document (`forum/threads/<id>.json`) with
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

## Storage

JSON documents are stored in Cloudflare R2 via the S3-compatible API. Without R2 credentials — or
if R2 is unreachable — the app falls back to `.data/` on disk: fine for local development,
ephemeral on Vercel. `GET /api/health` reports `{ storage: { configured, durable } }` (booleans
only) and returns 503 unless writes are actually reaching R2.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

## Community Directory Import

`PUT /api/admin/directory` imports residents, circles, and carshed allocations into R2 as one
document. It requires `Authorization: Bearer $ADMIN_TOKEN` (disabled when `ADMIN_TOKEN` is unset),
writes to R2 only — never to the ephemeral fallback — and responds with counts only. The directory
holds residents' contact details, so exports are gitignored and only signed-in residents can read it.

## Deployment

- The project is configured for Vercel serverless deployment.
- Prisma `postinstall` automatically generates the client during Vercel builds.
- Ensure the `DATABASE_URL` environment variable is configured in Vercel project settings.
- For durable forum, appreciation, and account storage, also configure the `R2_*` environment variables (see above).

## Project Structure

```
src/
  app/           # Next.js App Router routes
  components/    # Reusable UI and feature components
  lib/           # Utilities, Prisma client, validation, rate limiting
  types/         # Shared TypeScript types
prisma/
  schema.prisma  # Database schema
  seed.ts        # Seed data script
```

## Testing Notes

- The repository uses React Query for optimistic updates.
- API endpoints follow RESTful patterns with JSON problem details on error.
- Rate limiting is intentionally lightweight and in-memory; adjust for production as needed.

## License

MIT
