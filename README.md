# CVC Directory

A mobile-first community directory for residents, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router and Tailwind CSS, with data stored as JSON documents in Cloudflare R2.

## Features

- 🔐 **Resident sign-in** – Pick your name, enter your phone number; signed-out visitors see only the sign-in page.
- 📇 **Directory** – Residents by unit with contact details, circles with open seats, and carshed allocations.
- 🛠️ **Loan Library** – Items residents lend, with lent-out tracking and an "Ask to borrow" button.
- 🌱 **Skills** – What neighbors can help with, each skill listed by the resident who offers it.
- 💬 **Forum** – Neighborhood discussions grouped by topic, with replies nested to any depth, and polls.
- 🏡 **Homes for sale** – Admins and the Board list homes for sale, shown with contact details on the public front page.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page, all listed on their own page.
- 🙂 **Profiles** – Residents edit their own details and add a photo.
- 📅 **Calendar** – The next community event on the dashboard, and the full Google Calendar on its own page.
- 📱 **Installable app & notifications** – Add CVC to your home screen, and get push notifications when neighbors post.
- 💡 **Resources** – Local services neighbors recommend, by category, with who recommended each, likes, and comments.
- 📷 **Photos** – A shared gallery of community photos with captions and a full-screen viewer.
- 📚 **Circle wikis** – Each circle keeps its own wiki: a visual editor, live Markdown preview, history, and comments on pages or passages.
- 📄 **Documents** – Circles keep minutes, agendas, policies, and more, with versions; every document is searchable, contents included, and the Documents search covers the forum too.
- 🌀 **Circles** – Each circle has its own page, with its members in a side panel; residents join with a button or apply, as the circle chooses. Its members and the Board manage members, details, and an icon; icons show as badges in the directory.

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

## Public Front Page

Signed-out visitors to `/` see a public page about CVC — the community, its
land, how it governs itself, and how to get in touch — with **Resident sign-in** buttons; signed-in
residents see their dashboard at `/` instead (`src/components/home/public-home.tsx`). It contains
no resident information. Its hero photo lives in `public/home/`, which (like the manifest and icons)
is served without sign-in; every other page and API still requires it.

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
- Signed-out visitors see only the public front page and the sign-in page: middleware redirects every other page to `/login`
  (returning afterwards to the page they asked for) and answers 401 for every other API route.
- **Homes for sale** – admins and Board members list homes for sale at `/homes-for-sale` (linked
  from the account menu): title, unit, price, details, description, an optional photo, a listing
  link, and the buyer contact (name plus email and/or phone), with a status of *For sale*, *Sale
  pending*, or *Sold* (hidden). For-sale and pending homes appear, with their contact details, in a
  **Homes for sale** section on the public front page (and its navigation). Stored in
  `homes/listings.json`, photos in `homes/photos/<id>`; a listed home's photo is served publicly
  (`GET /api/homes/<id>/photo`), a sold one's isn't.
- The public front page is also at `/welcome`, for anyone: residents open it from **Public homepage** in
  the account menu to see what visitors see, with a bar leading back to the app. It opens on a
  forest-green band with a white oak leaf on the right (`public/home/leaf.webp`) and the aerial photo
  of the neighborhood (`public/home/aerial.jpg`, shown whole so the lake and mountains stay in view)
  framed over its lower edge. **Where we are** has a street map (OpenStreetMap) and **Our land** a
  satellite view (Esri World Imagery), both pinned on CVC at the end of Common Way (Leaflet,
  `src/components/home/land-map.tsx`; they ignore the scroll wheel and, on phones, one-finger drags,
  so the page scrolls past them); **Living sustainably** shows the solar roofs (`public/home/solar.jpg`). Headings across the site
  use the Fraunces serif (`font-display`), and the signed-in dashboard greets residents by first name
  on the same green band.

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
- **Profiles** – edit any resident's entry and photo from the "Edit" link beside them in the
  directory (`/profile/<personId>`), including resetting a phone number without the current one.
- **View as a resident** – "View as resident…" in the user menu, or "View as" beside anyone in the
  directory, shows the app exactly as that resident sees it: their name, their permissions, their
  own posts. It's read-only — while it's on, the middleware refuses every change, so an admin can
  never post or edit in someone's name — lasts at most an hour, and shows a banner with a way
  back. The view is a separate signed cookie tied to the admin's own session (useless to anyone
  else). Views don't appear in the sign-in log.
- **Sign-in log** – "Sign-in log" in the user menu (`/admin/sign-ins`) lists every successful
  sign-in, newest first, by day or by resident (sign-in count and last sign-in). It records only
  who and when — no phone numbers or devices — keeps the latest 2,000 in `auth/sign-in-log.json`,
  and is served only to admins.

## Forum & Appreciations

- **Forum topics** – the forum's front page (`/forum`) lists its topics, each with its discussion
  count and latest discussion; each topic's page (`/forum/topics/<id>`) lists its discussions and
  is where new ones start. Admins add, rename, and remove topics (removing one moves its
  discussions to **General**, which always exists and holds every discussion from before topics,
  or whose topic is gone).
  A discussion's author or an admin can move it to another topic when editing it. Topics live in
  `forum/topics.json`; each discussion records its `topicId`.
- **Forum** – signed-in members start discussions and reply to any post; replies nest
  to any depth (indentation stops at five levels so long chains stay readable on phones) and any
  branch can be collapsed. Authors can edit and delete their own posts; deleting a reply that
  others answered leaves a placeholder so the conversation below survives, and a discussion can be
  deleted by its author only while no one else has replied. Anyone can like the opening post or any reply (the heart
  fills straight away; hovering shows who liked it). Each thread is one JSON document (`forum/threads/<id>.json`) with
  replies stored flat by `parentId`, plus an index (`forum/index.json`) for the list page.
- **Polls** – a discussion can carry a poll ("Add a poll" when starting one): the title is the
  question, the post is optional context, and it has 2–10 options, one choice or several, and an
  optional closing date. Residents vote, change their vote, or take it back while it's open; results
  (counts, percentages, and who chose what) show once you've voted, when it's closed, or on "See
  results". The poll's author or an admin can close and reopen it. The author's options are fixed
  once posted, but a poll can **let people add their own options**: a voter types one in and votes
  for it (it's marked "added by …"; typing one that's already there just votes for it), up to 30
  options in all.
  Votes are stored with the thread (`POST /api/forum/threads/<id>/poll` votes, `PATCH` closes).
- **Appreciations** – signed-in members share short public thank-you notes, optionally addressed
  to someone. One at a time rotates through the footer of every page, large and centered (pausing
  while you hover, and not auto-advancing for visitors who prefer reduced motion); clicking it
  opens `/appreciations`, which lists them all. Anyone signed in can remove one. Stored in
  `appreciations/index.json`, newest 500 kept.

Authors always come from the signed-in session, never from the request body.

## Directory & Skills

- **Directory** (`/directory`) – a list of units, each with its residents stacked beneath (and
  their circle badges), plus carshed allocations. People listed as not living on site are hidden
  unless "Show non-residents" is on. Each name opens the resident's page (`/directory/<id>`) with
  their phone numbers, email, birthday, bio, circles, and household. Served by `GET /api/directory`
  to signed-in residents only (the route confirms the account server-side).
- **Managing the directory** – the Board Secretary (whoever holds that seat on the Board) and
  admins can add people ("Add a person"), edit anyone's entry including unit, owner/renter, and
  whether they live on site (and reset phone numbers), and remove people. Removing someone takes them out of their circles,
  closes their account (ending any session, so they can't sign in), and deletes their profile,
  photo, and notifications; what they posted stays under their name. Additions and removals live
  in `directory/people.json`, layered over the import, so a re-import doesn't undo them.
- **One profile, several households** – someone listed in more than one unit (e.g. a child whose
  parents live apart) has a single profile listed under each unit. Entries with the same name are
  combined automatically; directory managers can split a combined profile back into separate
  entries ("Split entries", for different people who share a name) or combine entries whose names
  differ ("Same person listed elsewhere?"). "Remove from unit N" takes someone out of one of their
  households and keeps them in the others. Links to a combined entry open the one profile.
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

## Documents

- Each circle's page has a **Documents** section; documents for everyone belong to the Community circle.
- **Wiki** – each circle also has its own wiki (`/circles/<id>/wiki`, with a page finder). Pages are
  Markdown, edited in a **visual editor** ([MDXEditor](https://mdxeditor.dev), open source, on
  Lexical): a toolbar for headings, bold/italic/strikethrough, lists and checklists, links, tables,
  code blocks, and dividers; Markdown shortcuts as you type; a toggle to see the raw Markdown or
  the **changes since the last save**; and **Link page or doc**, to pick a page (in any circle's wiki)
  or a document to link. Or edit as **Markdown beside a live preview**. **Links**: `[[Page title]]`
  links a page in the same wiki (a missing one shows red and offers to be created);
  `[[O&M:Page title]]` a page in another circle's wiki (by the circle's name); and
  `[[doc:Document title]]` a document, by title — this circle's first, then any circle's — opening its
  file (`[[doc:O&M:Document title]]` for one circle's). Any of them takes `|shown text`. Each page lists
  what's **Linked from** it — the pages, in any wiki that's turned on, linking to it
  (`GET /api/circles/<id>/wiki/<slug>/backlinks`). **Collapsible sections** use the Markdown
  directive syntax — `:::details{title="Winter duty"}` … `:::` (or `:::details[Winter duty]`) — and
  the visual editor's toolbar inserts them as a block with an editable title. Work in progress
  is kept on the device until saved (and offered back after a crash or closed tab); Ctrl/⌘+S saves;
  leaving with unsaved changes asks first; and a save that would overwrite someone else's newer
  version stops and says who. Longer pages get **On this page** (from their headings). Raw HTML
  isn't rendered and images show as their description. Every signed-in resident reads a wiki;
  those who can add the circle's documents edit it. Each page keeps its last 25 versions to view
  or restore, and its address when renamed. Stored per circle in `wiki/<circleId>.json`.
- **Tasks** – each circle can also track tasks (`/circles/<id>/tasks`), another section it can turn
  on or off (with Wiki and Documents, under **Edit details**). A task has a title, Markdown details
  (wiki and document links work), a status (*To do*, *In progress*, *Blocked*, *Done*), an owner
  (anyone in the directory — the circle's members listed first), a due date, a priority, and a
  checklist whose progress shows as a bar. The board has a column per status (stacked on phones):
  drag a card to move it, or use its status menu; filter to *Mine* or *Unassigned*, or find one by
  title or number. Each task has its own page (`/circles/<id>/tasks/<number>`) with a log of what's
  happened to it and **nested comments** — reply to any comment, fold a conversation away, link to
  one comment; a deleted comment with replies stays as "deleted" so the replies still make sense.
  The circle's members, the Board, and admins (anyone, for Community) add and change tasks; a task's
  owner moves it along (status and checklist) or hands it back; anyone can take on an unowned task
  (**I'll take it**) and comment. The dashboard lists **Your tasks** across circles. Push
  notifications (topic *tasks*): a task given to you, a task you added being done, and comments on
  tasks you own, added, or are replying in. Stored as `tasks/<circleId>.json` and
  `task-comments/<circleId>.json`.
- **Wiki comments** – anyone signed in comments on a page, or selects a passage and comments on
  that (the passage is highlighted; clicking either jumps to the other). Threads take replies and
  can be resolved and reopened by whoever started them, the page's editors, or an admin; authors
  edit and delete their own (admins any). The page's writers and the thread's participants are
  notified (the "wiki" notification setting). Stored per circle in `wiki-comments/<circleId>.json`;
  a page's comments go with it.
- **Sections on a circle's page** – a circle's members, the Board, and admins turn its Documents
  and Wiki sections on or off under **Edit details** (both on unless turned off). With Documents
  off, no new documents can be added and the circle drops out of the bulk-upload list; its existing
  documents stay searchable. With Wiki off, its pages can't be edited.
- **Bulk upload** – on `/documents`, **Upload documents** takes up to 50 files at once for one circle,
  chosen from a dropdown of the circles you can add to (your own; every circle for the Board and
  admins). Each file gets an editable title (from its name), type, and meeting date (filled in
  when the name has one, like `2024-03-12`); they upload one after another, and failures can be retried.
  The circle's members, the Board, and admins add documents (PDF, Word, Excel, PowerPoint, text,
  or images, up to 50 MB) with a title, one of the circle's document types, an optional meeting date,
  and a description. Each circle edits its own list of types ("Edit types": rename, reorder, add,
  remove), starting from Minutes, Agenda, Policy, Budget, Report, and Other; renaming a type
  relabels its documents, and removing one leaves existing documents with their old type. Stored in
  `documents/types.json`. Every signed-in resident can see and download every
  document. Whoever uploaded one, the circle, the Board, and admins can edit its details, upload a
  new version (earlier versions are kept and downloadable), or delete it. If a circle is deleted,
  its documents move to the Board.
- **Search** (`/documents`, and on each circle's page) matches every word of the query — or a
  "quoted phrase" — in titles, descriptions, and the documents' own text, best matches first, with
  the matching passage shown, and can be narrowed by circle and type. Text is read on upload from PDFs, Word, Excel, and PowerPoint files
  and text files; scanned PDFs, images, and older .doc/.xls/.ppt files are found by their details.
  On `/documents` (with no circle or type chosen) the search also covers the forum — discussion
  titles, posts, and replies — listing matching discussions below the documents with the post that
  matched; each opens at that reply (`GET /api/forum/search?q=`).
- **Storage** – files live in R2 (`documents/files/<id>/v<n>`), details in `documents/index.json`,
  and the searchable text of each current version in `documents/text.json`. Uploads travel in 4 MB
  pieces (under Vercel's request limit) and are reassembled and checked by their contents on the
  server; downloads use five-minute signed R2 links, so size isn't limited. Nothing is public.

## Circles

Circles are managed in the app (`circles/circles.json`). The store is seeded once from the imported
sheet — members only, dropping the sheet's empty placeholder seats — and is the source of truth
from then on, so re-importing the directory never overwrites circle changes.

- **Community circle** – a built-in circle (`community`) for everyone at CVC, shown across the top
  of `/circles` at double width. It has no member list and can't be joined, left, or deleted; any
  resident can add its documents, and its page has **Polls**: any resident asks everyone a
  question. The Board and admins edit the circle's details and icon.
- **Circle polls** – *Polls* is a section any circle can turn on (under **Edit details**; off by
  default, except on the Community page). A poll has a question, optional context, 2–10 options,
  one choice or several, an optional closing date, and optionally lets voters add their own
  options; results show as in forum polls. On the Community page any resident asks; elsewhere the
  circle's members, the Board, and admins do, and can make a poll **members only** (only the
  circle's members vote; everyone sees the results). A poll's author, admins, and — outside
  Community — the circle's members close, reopen, or delete it. New polls notify residents (just
  the circle's members, for a members-only poll; the "polls" notification setting). Stored in
  `circle-polls/<circleId>.json` (the Community page's in `community/polls.json`), served at
  `/api/circles/<id>/polls`.
- `/circles` lists the Community circle, then **Circles** (the official, sociocratically formed
  ones), then **Social Clubs** (e.g. the Chicken Tenders), each with name, member count, and
  description. Any resident can start a social club and becomes its first member; the Board and
  admins can also form official circles, and switch a circle between the two when editing its
  details (`kind: "club"`; unset means an official circle).
- **Emailing a circle** – the envelope on each circle's card (and in its members panel) asks
  whether to email the whole circle or only certain roles (op leader, secretary, …), then opens
  your mail app with their directory addresses (leaving you out), or copies them. Members with no
  email on file are named so they can be reached another way.
- **Joining** – each circle chooses who can join: anyone (a **Join circle** button) or by
  application (**Apply to join**, with an optional note), which its members, the Board, or an admin
  approve or decline. Circles default to applications. Members are notified of new applications
  and applicants of the answer (the "circles" notification setting). Applications are visible only
  to the circle's members, the Board, and admins (`GET /api/circles/<id>/applications`), and not
  in `/api/directory`. Anyone can leave a circle or withdraw an application
  (`POST`/`DELETE /api/circles/<id>/join`).
- `/circles/<id>` is each circle's page, with its members in a side panel on the right (below the
  header on phones). Its members and the Board can edit its name, description, and who can join, add residents, change a member's role or term, remove members, and upload an
  icon. Only the Board can delete a circle, the Board itself can't be deleted, and the Board always
  keeps at least one member.
- **Duty schedules** – a circle can have a rotation (e.g. the Chicken Tenders' chicken and compost
  duty), shown on its page as a month calendar that continues indefinitely: today's and
  tomorrow's duty, your household's next turns, households with members' phone numbers (from
  the directory), and the duty instructions for the current season. Each weekday belongs to one
  household, or to several that alternate week by week. Households on the rotation, the circle's
  members, the Board, and admins can record a swap or cover for any day (or flag that it needs
  cover); the circle's members, the Board, and admins adjust it via "Edit rotation". Schedules are
  specific to the circles that need one — today only the Chicken Tenders — so there's no button to
  add one elsewhere; a new one is set up with `PUT /api/admin/schedules` (with `ADMIN_TOKEN`).
  Stored in `circles/schedules/<id>.json`.
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
  their profile (or from a one-time prompt on the dashboard, shown only in the installed app), and choose what to hear about: new
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
  bytes (up to 4 MB). Any resident can remove a photo; whoever added it — or an admin — can edit
  its caption.
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

`/api/admin/circles` (same bearer token) lists circles (`GET`: id, name, kind, member count) and sets
the kind of circles by name (`POST {"kind": "club" | "circle", "names": [...]}`).

`/api/admin/circles/icons` (same bearer token) lists which circles have icons (`GET`), copies one
circle's icon to another (`POST {"from", "to"}`), or sets one from an image body (`PUT ?circle=<id>`).

`POST /api/admin/directory/people` (same bearer token) makes the directory managers' changes in
bulk: `{"residents": [{"personId", "resident"}], "leaveUnit": [{"personId", "unit"}], "remove":
[personId]}`, applied in that order. It responds with names and outcomes only.

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
