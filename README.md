# Community Village Cooperative Directory

A mobile-first community directory for members, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router, Tailwind CSS, shadcn-inspired primitives, Prisma, and Vercel Postgres.

## Features

- 📇 **Members** – Inline editable directory with CSV import/export and detailed drawer for skills, loan items, and circle memberships.
- 🌀 **Circles** – Sociocratic hierarchy management with primary/delegate link validation and visual relationship diagram.
- 🛠️ **Loan Library** – Searchable inventory with optimistic availability toggles.
- 🌱 **Skills Catalog** – Filterable skill bank with member contact information.
- ⚡ **Optimistic UI** – React Query mutations with toast feedback and rollback handling.
- 🛡️ **Validated APIs** – Next.js route handlers with Zod schemas, rate limiting, and Prisma enforcement.
- 🗳️ **Interactive Proposals** – Sociocratic proposals with per-section Q&A, an exponential-cost "Add a day" review extension, and requests to move discussion to an in-person gathering. State is stored as JSON in Cloudflare R2.

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

Optional (interactive proposals — falls back to a local `.data/` JSON file when unset):

- `R2_ACCOUNT_ID` – Cloudflare account ID.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` – R2 API token credentials (Object Read & Write on the bucket).
- `R2_BUCKET` – R2 bucket name that holds `proposals/<slug>.json` state documents.

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

## Interactive Proposals

The `/proposals` section hosts sociocratic consent proposals (currently the four-wheeler
agricultural-use proposal). Each proposal page offers:

- **Per-section Q&A** – every section has an "Ask about this" button; questions and threaded
  responses are visible to the whole community.
- **Add a day** – anyone can extend the 7-day review window. The cost doubles per day: the first
  extra day takes 1 click, the second 2 more, the third 4 more (2^n − 1 total clicks for n extra
  days), so extensions stay possible but bounded.
- **Request in-person discussion** – once enough members ask (default 3), the proposal is flagged
  to move to the next community gathering's agenda.

- **Editable, data-driven proposals** – each proposal (content + interaction state) is a JSON
  document in the store. The four-wheeler proposal ships as the seeded first proposal; its text
  can be edited in place via the "Edit proposal" button, and new proposals can be started from
  the `/proposals` page (they get template sections and a fresh 7-day review clock). Edits never
  touch the review clock or past questions.

Documents are stored in Cloudflare R2 via the S3-compatible API (one JSON per proposal plus an
index). Without R2 credentials the app transparently falls back to `.data/` on disk — fine for
local development, ephemeral on Vercel.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

Seed proposals live in `src/lib/proposals/content.ts`; they are logged into the store on first
access, after which the stored copy is the editable source of truth.

## Deployment

- The project is configured for Vercel serverless deployment.
- Prisma `postinstall` automatically generates the client during Vercel builds.
- Ensure the `DATABASE_URL` environment variable is configured in Vercel project settings.
- For interactive proposals, also configure the `R2_*` environment variables (see above).

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
