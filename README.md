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
- 📱 **Installable app & notifications** – Add CVC to your home screen, and get push notifications when neighbors post.
- 💡 **Resources** – Local services neighbors recommend, by category, with who recommended each, likes, and comments.
- 📷 **Photos** – A shared gallery of community photos with captions and a full-screen viewer.
- 🌀 **Circles** – Each circle has its own page where its members and the Board manage members, details, and an icon; icons show as badges in the directory.

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
- `ADMIN_TOKEN` – Enables the admin API (directory import, photo seeding); leave unset to disable it.
- `ADMIN_PERSON_IDS` – Optional comma-separated directory person ids of extra app admins (see Admins).
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

## Admins

Admins can do anything a resident can, on anyone's content. Sam Peret is built in
(`src/lib/auth/admins.ts`); add more by setting `ADMIN_PERSON_IDS` to their directory person ids.
Admin status is checked server-side on every request, and the user menu shows an "Admin" label.

- **Circles** – edit, manage members of, and delete any circle, as the Board can.
- **Forum** – edit or delete any post, including a whole discussion after others have replied.
- **Skills & Loan Library** – remove anyone's skills; mark anyone's items lent out or returned, or
  remove them.
- **Appreciations** – remove any appreciation (authors can remove their own).
- **Profiles** – edit any resident's entry and photo from the "Edit" link beside them in the
  directory (`/profile/<personId>`), including resetting a phone number without the current one.
- **View as a resident** – "View as resident…" in the user menu, or "View as" beside anyone in the
  directory, shows the app exactly as that resident sees it: their name, their permissions, their
  own posts. It's read-only — while it's on, the middleware refuses every change, so an admin can
  never post or edit in someone's name — lasts at most an hour, and shows a banner with a way
  back. The view is a separate signed cookie tied to the admin's own session (useless to anyone
  else), and each view is recorded in the sign-in log.
- **Sign-in log** – "Sign-in log" in the user menu (`/admin/sign-ins`) lists every successful
  sign-in, newest first, by day or by resident (sign-in count and last sign-in). It records only
  who and when — no phone numbers or devices — keeps the latest 2,000 in `auth/sign-in-log.json`,
  and is served only to admins.

## Forum & Appreciations

- **Forum** (`/forum`) – signed-in members start discussions and reply to any post; replies nest
  to any depth (indentation stops at five levels so long chains stay readable on phones) and any
  branch can be collapsed. Authors can edit and delete their own posts; deleting a reply that
  others answered leaves a placeholder so the conversation below survives, and a discussion can be
  deleted by its author only while no one else has replied. Anyone can like the opening post or any reply (the heart
  fills straight away; hovering shows who liked it). Each thread is one JSON document (`forum/threads/<id>.json`) with
  replies stored flat by `parentId`, plus an index (`forum/index.json`) for the list page.
- **Appreciations** – signed-in members share short public thank-you notes, optionally addressed
  to someone. They rotate through the footer of every page (pausable, and not auto-advancing for
  visitors who prefer reduced motion). Authors can remove their own. Stored in
  `appreciations/index.json`, newest 500 kept.

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

Circles are managed in the app (`circles/circles.json`). The store is seeded once from the imported
sheet — members only, dropping the sheet's empty placeholder seats — and is the source of truth
from then on, so re-importing the directory never overwrites circle changes.

- `/circles` lists every circle with its members and roles; any resident can start a circle and
  becomes its first member.
- `/circles/<id>` is each circle's page. Its members and the Board can edit its name, short code,
  and description, add residents, change a member's role or term, remove members, and upload an
  icon. Only the Board can delete a circle, the Board itself can't be deleted, and the Board always
  keeps at least one member.
- **Duty schedules** – a circle can have a rotation (e.g. the Chicken Tenders' chicken and compost
  duty), shown on its page as a month calendar that continues indefinitely: today's and
  tomorrow's duty, your household's next turns, households with members' phone numbers (from
  the directory), and the duty instructions for the current season. Each weekday belongs to one
  household, or to several that alternate week by week. Households on the rotation, the circle's
  members, the Board, and admins can record a swap or cover for any day (or flag that it needs
  cover); the circle's members, the Board, and admins set up the rotation via "Add a duty
  schedule" / "Edit rotation". Stored in `circles/schedules/<id>.json`. `GET/PUT
  /api/admin/schedules` (with `ADMIN_TOKEN`) lists circles and seeds a schedule.
- Icons are stored as binary objects (`circles/icons/<id>`, metadata in `circles/icons.json`) and
  served only to signed-in residents. In the directory, residents show the icons of their circles
  as badges linking to each circle's page.

## App & Notifications

- **Installable (PWA)** – `public/manifest.json`, icons in `public/icons/`, and a service worker
  (`public/sw.js`) make CVC installable: Chrome/Edge/Android offer "Install", and on iPhone it's
  Safari → Share → Add to Home Screen. The service worker caches nothing (every page needs a fresh,
  signed-in response); it exists for installing and for notifications. The manifest, service
  worker, and icons are served without sign-in, since browsers fetch them without cookies.
- **Push notifications** – residents turn them on per device under **App & notifications** on
  their profile (or from a one-time prompt on the dashboard), and choose what to hear about: new
  discussions, replies in discussions they started or joined, appreciations, photos, new
  recommendations and comments on theirs, and new loan-library items. Nobody is notified about
  their own posts. On iPhone/iPad (iOS 16.4+), notifications work once CVC is on the home screen.
- Delivery uses standard Web Push (`web-push`). The VAPID key pair comes from `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` if set, otherwise it's generated once and kept in R2 (`push/vapid.json`) —
  don't delete it, or every device must turn notifications on again. `VAPID_SUBJECT` optionally
  sets the contact URL/mailto. Subscriptions live in `push/subscriptions.json` (expired ones are
  dropped automatically) and choices in `push/preferences.json`. Sending never blocks or breaks
  a post: it's capped at a few seconds and failures are only logged.

## Resources

- `/resources` lists the categories (plumbers, dentists, realtors…) with how many recommendations
  each has; `/resources/<category>` shows that category's recommendations, each with who
  recommended it. Searching on the main page shows matching recommendations from every category.
  Residents recommend someone themselves (the category page prefills its category), like
  recommendations, and comment on them. Phone numbers, emails, and web addresses become links.
- Whoever made a recommendation (matched by directory person) or an admin can edit or remove it;
  comment authors or admins can edit or delete comments. Stored in
  `resources/recommendations.json`.
- `POST /api/admin/resources` (with `ADMIN_TOKEN`) adds recommendations on a resident's behalf:
  `{ submittedByPersonId, recommendations: [{ category, title, body }] }`. They're credited to, and
  editable by, that resident.

## Photos

- `/photos` is a shared gallery. Any resident can add photos (several at once, each with an
  optional caption); they're downscaled to at most 2400 px and re-encoded as JPEG in the browser,
  which also strips embedded metadata such as GPS location, then verified server-side by their
  bytes (up to 4 MB). Whoever added a photo — or an admin — can edit its caption or remove it.
- Images are stored in R2 (`photos/files/<id>`, details in `photos/index.json`) and served only to
  signed-in residents; photos are never committed to the (public) repository.
- `POST /api/admin/photos?caption=…` seeds the gallery with the image as the raw body, using
  `Authorization: Bearer $ADMIN_TOKEN`. Seeded photos have no uploader, so only admins manage them.

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
