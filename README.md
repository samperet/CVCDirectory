# Community Village Cooperative Directory

A mobile-first community directory for members, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router, Tailwind CSS, shadcn-inspired primitives, Prisma, and Vercel Postgres.

## Features

- 📇 **Members** – Inline editable directory with CSV import/export and detailed drawer for skills, loan items, and circle memberships.
- 🌀 **Circles** – Sociocratic hierarchy management with primary/delegate link validation and visual relationship diagram.
- 🛠️ **Loan Library** – Searchable inventory with optimistic availability toggles.
- 🌱 **Skills Catalog** – Filterable skill bank with member contact information.
- ⚡ **Optimistic UI** – React Query mutations with toast feedback and rollback handling.
- 🛡️ **Validated APIs** – Next.js route handlers with Zod schemas, rate limiting, and Prisma enforcement.

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

## Deployment

- The project is configured for Vercel serverless deployment.
- Prisma `postinstall` automatically generates the client during Vercel builds.
- Ensure the `DATABASE_URL` environment variable is configured in Vercel project settings.

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
