# Common Pastures

A mobile-first community directory for residents, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router and Tailwind CSS, with data stored as JSON documents in Cloudflare R2.

## Features

- 🔐 **Resident sign-in** – Pick your name and get a sign-in link (and code) by email; signed-out visitors see only the sign-in page.
- 📇 **Directory** – Residents by unit with contact details, circles with open seats, and carshed allocations.
- 👋 **New member welcome** – The Board Secretary emails each new member a welcome form (a short bio, including what drew them to cohousing, and how they'll sign in), with sign-in instructions and resources like the Living in Community Guide, then adds them to the directory in a click.
- 🛠️ **Loan Library** – Items residents lend, each with a photo if they like (taken right from a phone's camera), lent-out tracking, and an "Ask to borrow" button.
- 🌱 **Skills** – What neighbors can help with, each skill listed by the resident who offers it.
- 💬 **Forum** – Neighborhood discussions grouped by topic, with replies nested to any depth.
- 🏡 **Homes for sale** – Admins and the Board list homes for sale, shown with contact details on the public front page.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page, all listed on their own page.
- 🙂 **Profiles** – Residents edit their own details and add a photo.
- 📅 **Calendar** – The next community event on the dashboard, and the full Google Calendar on its own page.
- 📱 **Installable app & notifications** – Add CVC to your home screen, and get push notifications when neighbors post.
- 💡 **Resources** – Local services neighbors recommend, by category, with who recommended each, likes, and comments.
- 📷 **Photos** – A shared gallery of community photos with captions and a full-screen viewer.
- 📄 **Documents** – One place for every circle's documents: **pages written here** (a visual editor, editing together, embeds, history, and sticky-note comments on passages) and **files uploaded** (minutes, agendas, plans, scans, with versions). One list and one search cover both, contents included, and the forum too; one **New** button writes a page, uploads a file, or adds a link (Google Docs, Sheets and Slides recognised); a file or Google Doc can be turned into a page. **Proposals** are their own records — put to a circle, about pages and files, held in documents — and a circle consents to one **at a meeting**: the meeting's notes record who was there, and its **Consent** button records the circle, the meeting, who was there, and who recorded it. Pages and files show where their proposals stand: **Draft**, **Proposed**, **Consented**.
- 🐞 **Bugs & ideas** – A ladybug in the corner of every page sends the admins a bug report or a feature request, with the page it came from.
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

Email (optional; see App & Notifications):

- `BREVO_KEY` – Brevo API key: email is sent through Brevo first (free: 300 a day).
- `RESEND_KEY` – Resend API key: the backup sender. With neither key nothing is emailed.
- `EMAIL_FROM` – Sender, default `Common Pastures <notifications@commonpasturesvt.org>` (the
  domain must be verified in both Brevo and Resend).
- `SITE_URL` – The app's address for links in emails (default: Vercel's production domain).
- `BREVO_DAILY_LIMIT` / `BREVO_MONTHLY_LIMIT` – Brevo's allowance (default 300 a day, 9,000 a
  month); `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` – Resend's (default: its free 100 a day,
  3,000 a month).
- `OPENAI_KEY` – Draws new circles' icons (see Circles; `OPENAI_IMAGE_MODEL` picks the model,
  default `gpt-image-2.5-flare`) and reads photos of the printed duty calendar for the egg log (see
  Duty schedules; `OPENAI_VISION_MODEL`, default `gpt-5.6-sol`). Without it, new circles start
  without an icon and egg counts are typed in. Locally, `ICON_TEST_FAKE=1` and
  `EGG_READER_TEST=1` (both ignored on Vercel) stand in for OpenAI.

### Installation

```bash
npm install
npm run seed   # sample residents and wiki pages in ./.data/ (no R2 needed)
AUTH_SECRET=local-test ADMIN_PERSON_IDS=000000000006 npm run dev
```

Sign in as any of the people the seed prints (Finn Fir is an admin). With no `R2_*` variables, all
data lives in `./.data/`, which is gitignored.

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

Residents sign in at `/login` by choosing their name from a searchable dropdown and tapping
**Email me a sign-in link**. The names come from the imported community directory — only
residents with an email address on file can sign in — and the dropdown exposes names only, never
contact details or unit numbers.

- The email (`POST /api/auth/link`) goes to the resident's address **in the directory**, never one
  typed in; the page shows it half-hidden (`c•••@example.org`). It holds a **link** and a
  **six-digit code**. Either signs in, once, within 30 minutes: the link on whatever device opens
  it (`/login/<token>`), the code typed on the device that asked (`POST /api/auth/code`) — for an
  app added to a phone's home screen, which doesn't share the browser's sign-in.
- Opening a link signs in straight away and goes on to the dashboard (or wherever the link was
  asked for): the page posts the token once it has loaded, so a mail scanner that only fetches the
  page can't use it up. Using the link or the code spends both.
- Only keyed hashes of links and codes are stored (`auth/sign-in-links-2.json`,
  `lib/auth/sign-in-links.ts`). Five links an hour per person, until they sign in (which clears
  their other links); five wrong codes spoil the open
  links. Sign-in emails go out even in email test mode and are logged without the address.
- While the sign-in page waits, it notices a link opened in another tab of the same browser and
  continues; it never signs in a device just because someone else clicked a link.
- An account is created on a resident's first sign-in and linked to their directory entry.
- **Welcome tour** – the first time someone is signed in (on any device), a small window offers a
  short tour: the portal as a digital common house; circles keeping their own ways of working; each
  circle's page, forum, documents and links; the community's tools (Loan Library,
  Photos); the ladybug for bugs and ideas (lifted out and ringed in its corner while it's
  described); adding the app to the home screen (this device's way — iPhone, Android, or both on a
  computer — and left out if it's already added); and thanks. **No thanks**, closing it, or finishing
  it is remembered on the account (`tourSeenAt`, `POST /api/auth/tour`), so it opens by itself only
  once; **Take the tour** in the account menu runs it again (`components/tour/welcome-tour.tsx`). It
  never opens by itself while an admin views the app as someone, or on pages opened from an email.
- Signed-out visitors see only the public front page and the sign-in page: middleware redirects every other page to `/login`
  (returning afterwards to the page they asked for) and answers 401 for every other API route.
- **Homes for sale** – admins and Board members list homes for sale at `/homes-for-sale` (linked
  from the account menu): title, unit, price, details, description, an optional photo, a listing
  link, and the buyer contact (name plus email and/or phone), with a status of *For sale*, *Sale
  pending*, or *Sold* (hidden). For-sale and pending homes appear, with their contact details, in a
  **Homes for sale** section on the public front page (and its navigation). Stored in
  `homes/listings.json`, photos in `homes/photos/<id>`; a listed home's photo is served publicly
  (`GET /api/homes/<id>/photo`), a sold one's isn't.
- While the app is being proposed to the Board and community, visitors see only an opaque
  **under construction** notice with a **Sign in as a resident to view** button, at `/` and
  `/welcome`; residents previewing `/welcome` still see the page. Turn it off with
  `UNDER_CONSTRUCTION` in `components/home/public-home.tsx`.
- The public front page is also at `/welcome`, for anyone: residents open it from **Public homepage** in
  the account menu to see what visitors see, with a bar leading back to the app. It leads with the
  name — **Common Pastures**, *A Champlain Valley Cohousing development (CVC)* — in its header, its
  opening band, the under-construction notice and the footer. It opens on a
  forest-green band with a white oak leaf on the right (`public/home/leaf.webp`) and the aerial photo
  of the neighborhood (`public/home/aerial.jpg`, shown whole so the lake and mountains stay in view)
  framed over its lower edge. **Where we are** has a street map (OpenStreetMap) and **Our land** a
  satellite view (Esri World Imagery), both pinned on CVC at the end of Common Way (Leaflet,
  `src/components/home/land-map.tsx`; they ignore the scroll wheel and, on phones, one-finger drags,
  so the page scrolls past them); **Living sustainably** shows the solar roofs (`public/home/solar.jpg`). Headings across the site
  use the Fraunces serif (`font-display`), and the signed-in dashboard greets residents by first name
  on the same green band.

Session cookies last 90 days and are
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
  directory (`/profile/<personId>`), including the email address their sign-in links go to.
- **View as a resident** – "View as resident…" in the user menu, or "View as" beside anyone in the
  directory, shows the app exactly as that resident sees it: their name, their permissions, their
  own posts. It's read-only — while it's on, the middleware refuses every change, so an admin can
  never post or edit in someone's name — lasts at most an hour, and shows a banner with a way
  back. The view is a separate signed cookie tied to the admin's own session (useless to anyone
  else). Views don't appear in the sign-in log.
- **Bugs & requests** – residents send a bug report or a feature request from the ladybug in the
  bottom-right corner of every page (a short description; the page they were on and their browser
  come with it). Admins get a push notification for each (whatever their settings) and read them
  under "Bugs & requests" in the user menu (`/admin/feedback`): open ones first, with who sent
  each, from which page, and **Mark done** / **Open again** / **Delete**. Stored in
  `feedback/reports.json` (`POST /api/feedback` for anyone signed in; `GET`, and
  `PATCH`/`DELETE /api/feedback/<id>`, for admins); when it's full (1,000), the oldest done
  reports make room.
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
  fills straight away; hovering shows who liked it). A post's actions — like, reply, edit, delete —
  appear beside its byline when it's hovered (always, under the text, on touch screens); a post's
  like count stays in view once it has likes. The opening post shows when it was started, not who
  by, and reply counts aren't shown. Each thread is one JSON document (`forum/threads/<id>.json`) with
  replies stored flat by `parentId`, plus an index (`forum/index.json`) for the list page.
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
- **The Secretary page** (`/secretary`, **Secretary** in the account menu) – for the Board
  Secretary and admins, to welcome new members. **Invite a new member** takes their email (and
  name, if known) and emails them a link to their own **welcome form** (`/join/<token>`, no
  account needed): a short bio, including what drew them to cohousing, and the name, mobile
  number, and unit they'll be listed with. The same page explains how to sign in (by name, with a
  link emailed to them; adding the app to a phone's home screen) and lists the
  **welcome resources**. Their answers come back to the Secretary page, where **Add to directory**
  opens "Add a person" filled in from them (or, if they're already listed, **Already listed as …**
  marks them added); once they're in, their bio goes on their profile (if it has none), they're
  emailed that they can sign in, and their welcome page says so. Each invitation shows whether
  it's waiting, answered, or done, with **Copy link**, **Open**, **Send again**, and **Remove**.
  Links are the invitation's id signed with the app's secret, and work for 60 days from when they
  were last sent; answers can be changed until the person is added. An address has one open
  invitation at a time.
- **Asking to join** – someone not in the sign-in list chooses **I'm new here — ask to join** on
  the sign-in page and gives their name and email (`POST /api/join/request`). They're emailed the
  same welcome form (so the address is proved theirs), and the request shows on the Secretary page
  as "Asked to join from the sign-in page". The answer is the same whatever the address: one
  already in the directory is emailed how to sign in instead, so the form can't be used to find out
  who lives here. Asking again within ten minutes doesn't email again; five asks a minute from one
  place, and 40 open requests, at most. When anyone sends their welcome form (invited or asking),
  the Board Secretary and the admins are notified (the "circles" notifications) with a link to the
  Secretary page.
- **Welcome resources** – what every welcome page lists, chosen on the Secretary page in order:
  documents, pages every resident may read, and links, each with an optional note. Until the
  Secretary saves a list, it's any document or page titled "Living in Community Guide". New
  members open the documents and pages from their welcome link before they can sign in (pages
  read-only, with links into the app as plain text) — only what's on the list, and only while
  the link works. Invitations in `onboarding/invitations.json`, the list in
  `onboarding/resources.json` (`lib/onboarding`; `GET`/`POST /api/secretary/invitations`,
  `PATCH`/`DELETE …/<id>`, `POST …/<id>/send`, `GET`/`PUT /api/secretary/resources`; the public
  `GET`/`POST /api/join/<token>` and `GET …/resources/<id>`).
- **One profile, several households** – someone listed in more than one unit (e.g. a child whose
  parents live apart) has a single profile listed under each unit. Entries with the same name are
  combined automatically; directory managers can split a combined profile back into separate
  entries ("Split entries", for different people who share a name) or combine entries whose names
  differ ("Same person listed elsewhere?"). "Remove from unit N" takes someone out of one of their
  households and keeps them in the others. Links to a combined entry open the one profile.
- **Search** – the header's magnifying glass, "/" anywhere, or Ctrl+K (⌘K) opens a large search bar
  in the middle of the screen; results appear as you type (from two letters, grouped by kind), ↑/↓
  and Enter open one, and **See all results** goes to the full page (`/search`) – one search across
  the site for residents: people (by name, bio, and skills), circles, wiki pages, forum discussions,
  documents (their details and text), tasks, resources, and the loan library. Every word must match
  somewhere in a result; titles count most. Results come in groups, best first, with the matching
  passage quoted and the words marked, and **See all** for a group (`GET /api/search?q=…&kind=…`).
  The query stays in the address, so a search can be shared.
- **Header menus** – **Documents** and **Circles** in the header have menus (pointing at them, or
  their arrow): Documents offers **All documents**, **New document** (`/documents?new=`), and
  **Upload a file** (`/documents?upload=1`); Circles lists **Your circles**, then the others, each
  with its icon. Their labels still go to the page. On phones they show under those links.
- **Skills on profiles** – residents list their skills on their profile (**Your skills**); they
  show as chips on their directory page (each searching for everyone with that skill) and are
  searchable. They're the same skills as the Skills page, which still lists them all.
- The dashboard's cards and the header's sections: Directory, Circles, Loan Library, Forum, Photos,
  and Resources (and Calendar, in the header). Documents and Skills aren't linked from either:
  documents live on each circle's page and in search; skills on profiles and in search. Their pages
  (`/documents`, `/skills`) still work.
- **Skills** (`/skills`) – every skill belongs to the resident who lists it, taken from their
  signed-in account. Residents add and remove only their own; the catalog groups skills by
  category and shows who offers each one. Stored in `skills/index.json`.
- **Loan Library** (`/library`) – things residents are happy to lend. Every item belongs to the
  resident who lists it; only they can mark it lent out (optionally noting who has it), returned,
  or remove it. Others see an "Ask to borrow" button that emails (or calls) the owner using their
  directory contact details. Stored in `library/items.json`.
  An item can have a **photo**: **Lend something** opens with a photo tile — on a phone, **Take a
  photo** (straight to the camera) or **Choose from library**; on a computer, **Add a photo** — and
  owners can **Add photo** / **Change photo** on their items. Photos are shrunk to 1600px and
  re-encoded as JPEG in the browser before they're sent (quick on a phone connection, and the
  camera's location data is dropped), stored as binaries (`library/photos/<id>`, removed with the
  item), and served to signed-in residents (`/api/loan-items/<id>/photo`).
- **Phones** – form fields are 16px on small screens, so iPhones don't zoom in when one is tapped.

## Storage

JSON documents are stored in Cloudflare R2 via the S3-compatible API. Without R2 credentials — or
if R2 is unreachable — the app falls back to `.data/` on disk: fine for local development,
ephemeral on Vercel. `GET /api/health` reports `{ storage: { configured, durable } }` (booleans
only) and returns 503 unless writes are actually reaching R2.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

## Documents

- **One section for pages and files** (`/documents`, **Documents** in the menu). Its list and search
  cover both written pages (a book icon and a **Page** label) and uploaded files (a file icon and
  their type), filtered and sorted together (`GET /api/documents?pages=1` returns them as `items`,
  each `kind` "page", "file" or "proposal"; the **Type** filter can keep to **Written pages**, **All
  files**, **Proposals** (`/proposals` opens it), or one type of file). The one **New** button offers
  **Write a page** (a title and its circle, then the editor), **Meeting notes** (a page for one of a
  circle's meetings: its day, then the editor; named "Land Care Circle meeting, Oct 8, 2026" until
  given another title), **A proposal**, **Upload a file**, or **Add a link**. The **Map** button shows how pages link. `/wiki` (and
  `/wiki?keeper=…`, `?new=…`) now lead here; pages keep their `/wiki/<slug>` addresses. A rule of
  thumb: anything people will keep improving is best written as a page; a fixed record, or anything
  from outside, uploaded as a file.
- **Turn into a page** – a file with text (Word, PDF, slides, text) has a book icon among its
  actions, for anyone who can start pages in its circle: its text becomes a page with the file's
  title, kept by the file's circle and opening with a link back to the file, which stays as it is.
  A Word file keeps its headings, bold and italic words, and lists; other files come in paragraph by
  paragraph; the words are never changed (`POST /api/documents/<id>/page`,
  `lib/documents/to-markdown.ts`). A shared Google Doc can be turned into a page the same way
  (through Google's Word export).
- **Links** – **Add a link** keeps a Google Doc, Sheet, Slides deck, Form or Drive file — or any
  web page — with a circle's documents, titled, typed, dated and open to consent like a file
  (`POST /api/documents/links`; each version is a file or a link, `version.link`). Google links
  are recognised by their address (`lib/documents/links.ts`): the dialog fills in the title from
  Google, says whether it's shared with **Anyone with the link** (and how to share it if not), and a
  shared one's text is read through Google's export so search finds what's in it
  (`lib/documents/link-fetch.ts` fetches only Google's fixed export addresses, built from the
  file's id). In the list a link opens where it lives; a Google one has **Preview here** (shown in
  the page) and its kind (**Google Doc**…); **Change the link** saves a new version, keeping the old
  link in the history.
- Each circle's page has a **Documents** section, listing its pages and files by icon and title only
  (their type, dates, authors and opening lines are on the Documents page); documents for everyone
  belong to the Community circle.
  Each document shows its full title, then a line with its type, badges (Consented), circle where
  the list spans circles, date, and who uploaded the current version; Download, versions, and — for
  its managers — Edit, New version, and Delete are icons at the end of that line that appear on
  hover (always, on touch screens). A description shows below.
- **Proposals** (`lib/proposals`, `/proposals/<id>`) – something put to a circle for its consent:
  a title, the proposal itself (Markdown), the **documents it's about** (pages or files, found by
  title — "adopt this policy"), and the day it's to be decided, if known. Whoever can start a
  circle's documents can put a proposal to it (any resident, for Community); everyone at CVC can
  see proposals. It's **Proposed** until the circle consents — or until it's **Withdrawn** (and
  perhaps **proposed again**); whoever proposed it, the circle's members, the Board, and admins
  change, withdraw, or delete it (a consented one can't be changed: a new proposal changes it).
  Proposals are made from the Documents **New** menu, a page's or file's **Propose for consent**,
  or the editor's **Add a proposal** (the handshake), which puts it in the page — a new one (about
  that page, unless it's meeting notes) or one already waiting — as `::proposal{id="…"}` on a line
  of its own: a card with the proposal, the documents it's about, where it stands, and what you can
  do. Its own page also lists the pages that hold it. The circle's members hear of a new proposal,
  and of its consent (topic "Proposals to your circles…"; everyone, for Community's).
- **Consent is given at a meeting** (`canRecordConsent` in `lib/circles/consent.ts`: anyone in the
  circle, anyone on the Board — for any circle — and admins; the Board records Community's).
  - **In a meeting's notes** (a page with a meeting day — set with **Who's present** — kept by
    the circle): a **Proposals** box under the title lists those consented at this meeting and
    those still waiting for the circle's consent, each with **Consent**; a proposal card in the
    notes has **Consent at this meeting**. Consenting there records the meeting, who was there
    (from the notes; asked for first if they don't say yet, and saved to them), the circle, and
    who recorded it, with an optional note ("with the amendment that…").
  - **Anywhere else** — a proposal's page or card, a page's or file's **Record consent** — asks
    **at which meeting**: the circle's notes and minutes with a date (files with a meeting date
    count, and then who was there is asked for), the latest first, or **a meeting with no notes
    here yet** (its day and who was there; notes named for the circle and the day are started for
    it). A page or file with no open proposal gets one made for it there and then.
  - Each person present is recorded as a member of the circle or not (guests and other residents),
    shown as "Present: Cara Cedar and Dev Dogwood · also there: Sam (guest)". The documents a
    proposal is about are consented **at their current versions**: a page edited (or a file given a
    new version) afterwards shows **Changed since consent** until a new proposal is consented.
    **Withdraw consent** (for a record made by mistake) puts the proposal back to waiting.
  - Pages and files show their stage — a pill under a page's title (**Draft**, **Proposed** — the
    day to decide — or **Consented**, with a link to the proposal), a badge on a file — and the
    record: "Consented Oct 8, 2026 at Land Care Circle meeting, Oct 8, 2026 by Cara Cedar and Dev
    Dogwood · recorded by Dev Dogwood". They keep a copy of where their proposals stand (`proposal`
    and `consent`, each with its `proposalId`), so lists and filters read the document alone.
    Records from before proposals (consent recorded on a page or file with a date and who
    consented, without a meeting) still show and can be withdrawn; new ones can't be made that way
    (`PUT /api/documents/<id>/consent` answers 410).
  - The Documents list's stage filter (**Proposed**, **Consented**) covers pages, files, and
    proposals; search finds proposals by their words (and site search lists them); an
    Information module on a circle page can show **Proposals waiting for consent**; the
    dashboard's **Waiting for consent** card lists the open proposals of the circles you're in —
    and Community's — when there are any ("And N more" opens `/documents?stage=proposed`).
  - API: `GET`/`POST /api/proposals` (list — `circle`, `status`, `q` — or put one to a circle; with
    `consent`, consented at once), `GET`/`PATCH`/`DELETE /api/proposals/<id>` (`status`:
    "withdrawn" or "proposed"), `POST`/`DELETE /api/proposals/<id>/consent` (`meeting`: `{kind:
    "page"|"file", id}` or `{kind: "new", date}`; `present` when the notes don't say; `note`),
    `GET /api/proposals/meetings?circle=`. Stored in `proposals/proposals.json`; when a circle is
    deleted its proposals not yet consented go to the Board.
- **Written pages** (the wiki) – one wiki for all of CVC, its pages listed in Documents. Every page has a **parent circle**, and its own
  settings (nothing is inherited): **who can see it** — everyone (the default), only its parent
  circle, or its parent and chosen circles — and **who can edit it** — its parent circle (the
  default; anyone, for Community's pages) or anyone who can see it. The parent circle's members
  (and the Board and admins, who can always see and edit everything) change the parent circle and
  these settings, and can delete the page. A page reads clean: its **Edit** button opens the editor,
  where the page's tools live — **Parent circle**, **Who can see & edit**, and
  **History** (earlier versions to view or restore). A page someone can't see is left out everywhere for them:
  the page list, search, @ search, links ("a page you can't see"), embeds, backlinks, circles'
  Information modules, and notifications. Pages don't nest: they connect by **links** and **embeds** (each page lists what's
  **Linked from** it). Documents lists every page you can see, with a search and a filter by
  circle (`/documents?circle=<circleId>`); **New → Write a page** asks which of your circles keeps it. A circle's
  **Add Information** starts a page with that circle as its parent (so it shows in the circle's
  Information); **@ new
  page** (and a link to a page that doesn't exist yet) starts a page kept by the same circle as the
  page it was started from. Pages are Markdown, edited in a **visual editor**
  ([MDXEditor](https://mdxeditor.dev), on Lexical) with a simple toolbar: headings, bold/italic,
  lists and checklists, links, photos, tables, collapsible sections, embedded pages, and **polls**;
  Markdown shortcuts work as you type. **Typing @** searches pages and documents and links the one
  you pick — or, for a new title, links a new page (`GET /api/wiki/link-search`). The toolbar's one
  **Link** menu offers **Web address…** (a link on the selected words), **A page or document…**
  (find a page or an uploaded file; a page can be linked or shown here, a file is linked), and
  **Upload a file…** (into the parent circle's documents, then linked). **Links**
  show as **tags**; they're written `[[Page title]]` (titles are unique across the wiki; an older
  `[[O&M:Page title]]` still works) and `[[doc:Document title]]` (`[[doc:O&M:Document title]]` for
  one circle's); any of them takes `|shown text`. **Renaming a page updates the links and embeds
  that point to it.** **Embeds** (`::embed{page="Title" section="Heading"}`) show another page, or
  one section of it, inline and always current, labelled with the circle that keeps it; the
  toolbar's **Link** menu (**A page or document…**) adds one, or just a link to the page. Changes
  **save as you type**, and several people can edit at once (others' saves merge in paragraph by
  paragraph). Each page keeps its last 25 versions (`wiki/history/<pageId>.json`), and its address
  when renamed. Pages are stored together in `wiki/pages.json` (`/api/wiki/pages`,
  `/api/wiki/pages/<slug>`). Until October 2026 each circle had its own wiki
  (`wiki/<circleId>.json`); the first read brought them together (keeping each page's old address,
  `/circles/<id>/wiki/<slug>`, as a redirect) and left the old documents untouched.
- **Polls** live in wiki pages: the editor's poll button asks a question with 2–10 options, one
  choice or several, an optional closing date, optionally letting voters add their own options, and
  — outside Community — optionally for the page's parent circle's members only (everyone sees the results). It's
  placed in the page as `::poll{id="…"}`. Residents vote, change or take back their vote while it's
  open; results show once you've voted, when it's closed, or on "See results". Its author, admins,
  and (outside Community) its circle's members close and reopen it. A poll is announced when the page
  holding it is first saved (the "polls" notification setting; just the members, for a
  members-only poll). Stored together in `wiki/polls.json` (`/api/wiki/polls`), each with its
  circle. Circles no longer have a separate Polls section, and the forum no longer has polls.
- **Tasks** – each circle can also track tasks (`/circles/<id>/tasks`), another section it can turn
  on or off (by adding or removing its Tasks module under **Edit**). The Tasks module's
  **Settings** say **who can add tasks**: the circle's members (and the Board and admins; the
  default) or **any resident** — who can then also change and delete the tasks they added. A task has a title, Markdown details
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
- **Wiki photos** – a wiki's editors add photos to its pages: the visual editor's picture button,
  pasting or dropping a photo into either editor, or **Insert photo** in Markdown mode. Photos are
  downscaled in the browser (longest side 2000px, re-encoded as JPEG, which drops location data;
  a small PNG such as a screenshot goes as it is), up to 3 MB, and stored privately
  (`wiki-images/<circleId>/<id>`, served to signed-in residents at
  `/api/circles/<id>/wiki/images/<id>`). Pages show them inline, opening full size when clicked;
  images from other websites show only as their description.
- **Highlights** – select words in the editor and choose a colour from the highlighter in the
  toolbar or the right-click menu (yellow, green, blue, pink, or orange); while the cursor is in
  highlighted words, their colours and an eraser show just above them. They're drawn like a
  highlighter pen and kept in the page as `:mark[the words]{color="green"}`. (Pages used to have a
  colour of their own, and to be **pinned** to circles, the dashboard, people, tasks, documents, and
  discussions; pinning has been removed. The old `pins.json` is left in storage, unused.)
- **Styles** – the editor's **Style** menu turns the block the cursor is in (or the selected
  blocks) into a Paragraph, a **Quote** (shown between two curved strokes, like parentheses), a
  **Callout** (set apart by a light green dotted line with rounded corners; written
  `:::callout` … `:::`, keeping bold and italic), or a heading.
- **Right-click menu** – in the editor, right-clicking offers cut, copy, paste, bold, italic,
  strikethrough, code, highlight (or, inside a highlight, change its colour or remove it), link, and
  clear formatting. Shift + right-click opens the browser's own menu, for spelling suggestions.
- **Wiki map** (the **Map** button at the top of `/wiki`, for everyone — each sees only the pages they can) –
  **Islands**: each parent circle is a soft island (in its own colour) holding its pages (documents
  aren't shown). Links arc between them. Hovering shows just a name; clicking anything opens a **panel** (docked on the
  right; a sheet along the bottom on phones) with its opening lines, who last edited it, what it
  links to and from — each clickable — plus **Open**, **Zoom to**, and
  **Show connections** (fading everything else). Clicking a circle also zooms in. **Find** zooms to
  anything. Built from `GET /api/wiki/graph` (`/documents?map=1`;
  `/admin/wiki-map` redirects there).
- **Wiki comments** – anyone signed in selects words on a page (any amount, a word to the whole
  page) and comments on them; there's no comment box for the page as a whole. Comments show as
  square yellow sticky notes beside the page (writers by their initials, their name on hover; reply,
  edit and delete appear when the pointer is over a note), and the passage is highlighted (clicking
  either jumps to the other). While reading, "On this page" shows the section you're in in bold.
  Threads take replies and can be resolved and reopened by whoever started them, the page's editors,
  or an admin; authors edit and delete their own (admins any). The page's writers and the thread's
  participants are notified (the "wiki" notification setting). Stored page by page in
  `wiki/comments/<pageId>.json`; a page's comments go with it.
- **A circle's page** – is built from **modules**: **Information** and **Custom Text** (as many of
  each as the circle likes),
  **Members** (not on Community, which is everyone), the **duty schedule** where
  there is one, **Tasks**, **Forum** (see Circle forums), **Log**, **Finances**, and **Documents** (each of those once). One **Edit** button (the
  circle's members, the Board, and admins) edits the whole circle at once: its name and description
  in place (and, for the Board, whether it's a social club), its icon (**Upload icon** / **Change
  icon**, saved as soon as it's chosen), **Delete circle** (the Board), and its page — it adds
  modules (**Add module**), removes them, drags them into order — or moves them
  with arrows, on phones — and sizes each to a third, half, two thirds, or the full width of wider
  screens, in rows (the last module of a row widens to fill it, so there are no holes); phones
  stack them. **Members** always has its own column on the right (after the rest, on phones), so
  a long list of members never pushes the other modules apart. **Save** sends the details and the page together in one request
  (only what changed); **Cancel** drops it all. Everyone sees the circle's page as it was saved
  (stored on the circle as `modules`). Each reader can fold any module away with the arrow by its title,
  remembered on their device.
  - A **Custom Text module** holds the circle's own words, written in its **Settings** with the
    wiki's visual editor (headings, quotes and callouts, bold, italic and highlights, lists and
    checklists, links, tables, collapsible sections, dividers) under a heading of its choosing, on
    a background it picks (white unless it chooses mint, yellow, peach, pink, lavender or blue), and
    shown formatted as on the wiki. It's saved with the page (`module.text.body`, Markdown, up to
    20,000 characters; `module.text.background`); for anything longer, write a page and show it with an Information module.
  - An **Information module** has a title ("Information" unless given one) and **Settings**:
    which pages it shows — **Specific pages** (up to 12, searched by title, shown in the order
    chosen), **All pages of a circle** (any circle, by title), or **Recently edited** (3–12, from
    one circle or the whole wiki, newest first) — and how: **Full**, **Summary** (cards with their
    opening lines; the first six, then **+N more**), or **Titles only**. Each reader sees only the
    pages they can. A module listing this circle's own pages has **Add Information** for whoever
    can start pages for the circle.
  - Removing **Tasks** or **Documents** turns them off for the circle (its existing tasks and
    documents are kept, and return when the module is added back). With Documents off, no new
    documents can be added; its existing ones stay searchable. Removing **Finances** keeps the
    circle's expenses, budgets, and receipts, out of reach (its API answers 404) until it's added
    back.
  - A circle that hasn't saved its page yet shows what it had before: an Information module with
    all of its own pages, Members, its duty schedule, and Tasks and Documents unless they
    were turned off (from the older `layout`, `features`, and `infoView`).
- **Bulk upload** – on `/documents`, **Upload documents** takes up to 50 files at once for one circle,
  chosen from a dropdown of the circles you can add to (your own; every circle for the Board and
  admins). On a circle's own page, **Add documents** does the same for that circle (no dropdown);
  a single file works the same way, and a description can be added afterwards with Edit.
- **Filtering and sorting** – document lists filter by circle (on `/documents`), type, year (on
  `/documents`), and stage (Proposed or Consented), and sort by newest (the default), oldest, title, or recently
  updated (best match while searching); **Clear** resets them (`GET /api/documents?sort=…&year=…`). Each file gets an editable title (from its name), type, and meeting date (filled in
  when the name has one, like `2024-03-12`); they upload one after another, and failures can be retried.
  The circle's members, the Board, and admins add documents (PDF, Word, Excel, PowerPoint, text,
  or images, up to 50 MB) with a title, one of the circle's document types, an optional meeting date,
  and a description. Each circle edits its own list of types (**Edit types** on the Documents page,
  for the circle the list is filtered to — or, for the Board and admins, any circle chosen there:
  rename, reorder, add, remove), starting from Minutes, Agenda, Policy, Budget, Report, and Other; renaming a type
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
  resident can add its documents and information (and polls in it). The Board and admins edit the
  circle's details and icon.
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
  - **Printing** – **Print calendar** (anyone can) offers the twelve months from this one (in
    Vermont), the three after this month chosen to start with, and opens
    `/circles/<id>/schedule/print?months=2026-11,2026-12,2027-01` (up to twelve) in a new tab,
    which prints by itself: one month to a US Letter page, landscape, black and grey only, with
    who's on duty each day (swaps and cover included, nothing before the schedule starts). It's
    made to be photographed: a black square near each corner, the month in large type and a code
    such as `EGGS 2026-11`, and on every day a box the same size in the same place for that day's
    count. The app's header, footer and the page's toolbar aren't printed.
  - **The egg log** – what a schedule counts each day (`dailyCount`: "Eggs" unless **Edit
    rotation** names something else; left empty, there are no boxes, log, or photo reading). Each
    day's count shows in the calendar, with this month's total and average a day, last month's,
    the last twelve months, and **Download CSV** (`date,count,recorded by`). Anyone signed in sees
    them; whoever may change days records them — in a day's editor, or with **Record eggs**: a
    month typed in, or read from a photo. Counts are whole numbers from 0 to 500, for today and
    days gone by (`GET`/`PUT /api/circles/<id>/eggs` with `{ counts: { "2026-11-05": 12 }, photoId? }`
    — null clears a day; `?format=csv` for the CSV).
  - **Reading a photo** – **Take a photo of the calendar** (or choose one) resizes it to 2576 px
    on its long side and sends it to `POST /api/circles/<id>/eggs/read`, which keeps it and asks
    OpenAI (`gpt-5.6-sol` through the Responses API: the photo at full size, structured output,
    nothing kept by OpenAI) for the month and the number in each day's box
    (`lib/schedules/egg-reader.ts`, which describes the printed page). What was read comes back
    to be checked, never saved by itself: the month's boxes filled in under the photo, those it
    wasn't sure of marked, a count that differs from the one recorded saying what it was; **Save
    counts** sends the days that changed. Needs `OPENAI_KEY` — without it, counts are typed in.
    Locally, `EGG_READER_TEST=1` answers from `.data/egg-reader-fixture.json` instead of the API.
  - Stored in `circles/eggs/<circleId>.json` (each day's count, who recorded it, when, and
    whether from a photo; the newest 4000 days and the last 100 photos), the photos as
    `circles/eggs/<circleId>/photos/<id>.jpg`, shown to anyone signed in at
    `/api/circles/<id>/eggs/photos/<id>`.
- **Meeting notes** are written as pages in Documents (**New → Meeting notes**; there's no separate
  Meetings module; `/circles/<id>/meetings/…` leads to the circle and `…/proposals/<id>` to the
  proposal). Proposals to the circle are consented in them (see Documents → Consent is given at a
  meeting). In the page editor's toolbar:
  - **Who's present** (the people icon) – the meeting's day (which makes the page a meeting's
    notes), and the page's circle's members as chips to tick (**All members present**), plus **Add
    someone** for any other resident, or a guest by name. Saved as the page's `meetingDate` and
    `present`, shown under its title ("Meeting Oct 8, 2026 · Present: …"); it isn't a new version.
    Notes from before pages had a meeting day count as dated the day they were started.
  - **Add a proposal** (the handshake) – a new proposal, or one already waiting, put in the notes.
  - **Transcript** – at the end of every page, folded away like this: "Transcript · N words".
    While editing, its line has **Record** and **Pause** (the toolbar's microphone records too):
    what's said is written down by the browser's own speech recognition (Chrome, Edge, Safari —
    not Firefox; no account or key, no speaker labels; Chrome and Edge send the audio to Google or
    Microsoft to be recognised) while you keep taking notes in the page, and saved with the page as
    it comes (the page's `transcript`, not a new version, and searchable). Opened, it shows the
    whole transcript, with **Copy** and **Clear** while editing. Readers see the same folded line
    and can open it.
- **Log** – a circle module for short updates, each with replies: a small forum of the circle's
  own, kept apart from the Forum because it **never notifies or emails anyone**. Its **Settings**
  say who can post updates (the circle's members and the Board, or any resident); anyone signed in
  can reply. Updates show newest first, ten at a time (**Show older updates**). An update can
  name the people it involved — **Add people** picks residents, or takes anyone else's name — shown
  under it as **Involved:** (residents link to their entry); its author can **Add people** or
  **Edit people** later, and nobody named is notified. Authors edit and
  delete their own; the circle's members, the Board, and admins can delete any. Posting needs a
  Log module on the circle's page (`GET`/`POST /api/circles/<id>/log`,
  `PATCH`/`DELETE …/log/<entryId>`, with `people` alongside `body`; stored in
  `logs/<circleId>.json`, using the shared comment rules; deleted with the circle).
- **Finances** – a circle module (any circle, Community included) that tracks the circle's spending
  against a budget for each year, with receipts. Its members, the Board, and admins (on Community,
  which has no members, just the Board and admins) **Add expense**, edit and delete them, **Set a
  budget**, and record who's been paid back. Its **Settings** say who can see it — **Everyone at
  CVC** (the default) or **The circle's members and the Board** (admins always can); the server
  reads that setting, so anyone else gets a 403 and the module just says who can see it. The
  Settings also set the budget for a year (an amount and an optional note; clearing the amount
  removes it), saved straight away rather than with the page.
  - The module shows a year at a time (the years with expenses or a budget, and this one):
    "Spent $1,234.56 of $2,000.00 for 2026" over a bar that turns amber past 90% and red over the
    budget (or "Spent $1,234.56 in 2026" and **Set a budget**), the year's totals by category, and
    **Owed** — what each person who paid out of their own pocket hasn't had back yet, from any
    year. Then the year's expenses, newest first: date, description, category, payee, who paid
    ("Owed to Ada Ash" until they're paid back, then "Reimbursed Oct 8"; or "Circle funds" —
    nobody to pay back), the amount (a refund or credit is negative, shown with its minus in
    green), and the receipt. Each row's parts sit in columns when the module is wide and stack into
    lines when it's narrow or on a phone (by the module's own width, so any module size works).
    **Download CSV** saves the year's expenses (`land-care-circle-expenses-2026.csv`: date,
    description, category, payee, paid by, amount, reimbursed on, receipt yes/no; oldest first,
    quoted where needed, text that could run as a spreadsheet formula defused).
  - An expense has a date (today in Vermont to start with; up to a year ahead), an amount typed
    as people do ("12", "12.5", "$1,234.56", "-3.00"; stored as whole cents, never $0, within
    $100,000 either way), a description, a category (suggesting the circle's own), a payee, who
    paid (the person adding it to start with, any resident or anyone by name, or the circle's
    funds), whether they've been reimbursed and when, and a receipt: **Take a photo** (on phones)
    or **Choose a file** — a photo, shrunk to JPEG in the browser, or a PDF up to 10 MB (one over
    4 MB is sent in pieces, as a request can't carry more). Receipts are served only to those who
    can see the module. Up to 5,000 expenses per circle. Nothing here notifies anyone or appears in
    search.
  - `GET /api/circles/<id>/finances?year=` (the year's budget, expenses, totals, categories, the
    years, `canEdit`, `view`), `POST …/finances/expenses`, `PATCH`/`DELETE …/expenses/<expenseId>`,
    `PUT`/`GET`/`DELETE …/expenses/<expenseId>/receipt` (the raw file as the body),
    `PUT …/finances/budget` (`{ year, amount | null, note }`), `GET …/finances/export?year=` —
    404 without a Finances module on the circle's page. Stored in `circles/finances/<circleId>.json`
    with receipts at `circles/finances/<circleId>/receipts/<expenseId>`; removing the module keeps
    them, and so does deleting the circle (money records aren't thrown away: a circle started again
    under the same name finds them).
- Icons are stored as binary objects (`circles/icons/<id>`, metadata in `circles/icons.json`) and
  served only to signed-in residents. In the directory, residents show the icons of their circles
  as badges linking to each circle's page.
- **New circles get an icon drawn for them** – right after a circle or club is created, the page
  asks `POST /api/circles/<id>/icon/generate`, which sends OpenAI's image model (`OPENAI_KEY`,
  `OPENAI_IMAGE_MODEL`, default `gpt-image-2.5-flare`) up to six of the other circles' icons as
  references with a prompt naming the new circle and its description, asking for a matching icon
  with no text (`lib/circles/icon-generator.ts`). It takes about a minute: the circle's page shows
  **Drawing…** over its icon, and the icon appears when it's ready (a 1024px WebP). Only a circle
  without an icon gets one, so an uploaded icon is never replaced; its members can change it as
  before. Without `OPENAI_KEY` nothing happens. Locally, `ICON_TEST_FAKE=1` skips OpenAI (it
  reuses a reference and records the prompt in `.data/icon-fake.json`).

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
- **Email** – everything that sends a notification can also be emailed (`notify()` does both;
  `lib/email/`), through Brevo (or Resend when Brevo can't) from `EMAIL_FROM`, to the address in each resident's directory
  entry — including residents who have never signed in. Each resident picks what to be emailed
  about under **Email me about** on their profile; until they do, they get discussions, replies,
  circle requests, tasks, polls, and comments on their pages (not photos, appreciations,
  recommendations, the loan library, or documents). Nobody is emailed about their own posts, and
  a circle's Log never emails. Every email links to the thing itself and has a **Stop them** link
  (and a one-click `List-Unsubscribe` header) that turns that topic off without signing in — a
  token signed with the app's secret. Choices live in `email/preferences.json`, by person id.
- **Test mode** – admins open **Email** in the account menu (`/admin/email`). Test mode starts
  **on**: only the addresses on its allowed list are emailed (subjects start "[Test]") and everyone
  else is counted as skipped. Admins add and remove allowed addresses, send a test email to one,
  and see recent sends (counts only; addresses only in test mode). Turning test mode off asks
  first; from then on new emails go to everyone who chose them — nothing earlier is re-sent.
  New member welcome emails from the Secretary page aren't held back by test mode — each goes to
  one address the Secretary typed, to someone not yet a resident — and are logged as "New member
  welcome", without the address.
  Settings in `email/settings.json`, the log (last 200) in `email/log.json`. Locally,
  `EMAIL_TEST_SINK=1` writes emails to `.data/email-sink.json` instead of sending them.
- **Two free senders**: every email goes through **Brevo** (300 a day free) while it has room and
  works, and otherwise through **Resend** (100 a day and 3,000 a month). An outage, a refused key
  or a used-up day at Brevo falls over to Resend (`sendEmails` in `lib/email/deliver.ts`). The app
  keeps count for each (`email/quota.json`; `BREVO_*_LIMIT` and `EMAIL_*_LIMIT` change the limits):
  sign-in links and welcomes come first; notification emails stop at 70% of the day. The admin
  page shows each sender's use today and this month, and which sender took each sending.
- **When a sender refuses**, its status, error code and message are kept with the sending in the
  admin **Recent sends** log (and the server log), and a failed sign-in email shows the status
  codes, e.g. `(brevo 401, resend 403)`. Common causes: Brevo **401** — the key is an SMTP key
  rather than an **API key** (`xkeysib-…`), or Brevo's **Authorised IPs** blocks Vercel's changing
  addresses (Security → Authorised IPs → turn the blocking off); Brevo **400** — the sender
  (`notifications@commonpasturesvt.org`) or its domain isn't verified there; Resend **403** — the
  domain isn't verified, or the key can't send.
- **Unsubscribe links** ask first (GET shows a button; POST — the button or a mail app's one-click
  — acts), so link scanners can't unsubscribe anyone.

## Circle forums

A circle's **Forum** module (`src/lib/groups/`, `src/components/groups/`) holds its conversations;
circles keep using Google Groups or whatever email they like for mail.

- The module lists the circle's conversations; its members, the Board, and admins **Start a
  conversation** (optionally **with a poll** — the title is the question) and reply on the
  conversation's page (`/circles/<id>/forum/<thread>`). Everyone at CVC can read it; members
  delete any message and authors edit their own.
- **Every new message** sends an app notification to the circle's current members (topic
  "groups", push only — never emailed), except its author.
- Poll answers are kept by person; members answer on the page.
- Messages and conversations marked with an envelope came by the group email the app had briefly
  in October 2026; they're kept as they were.
- Stored as `groups/<circleId>/index.json` (conversations), `groups/<circleId>/threads/<id>.json`
  (messages) and `groups/<circleId>/polls/<id>.json`. Deleting a circle forgets its index.

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
  Unit and owner/renter stay as imported. The email address is where sign-in links go, so a
  resident can change theirs but not remove it (admins can). Photos are center-cropped and
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
  app/              # Pages (thin server shells) and the API (app/api/**/route.ts)
  components/       # Client components by feature; ui/ holds the primitives, comments/ the shared comment tree
  lib/<feature>/    # shared.ts (types, pure helpers) · store.ts (R2 JSON) · access.ts (who may) · http.ts (route helpers)
  lib/auth/actor.ts # Who is acting (account, resident, name, admin), as every store sees them
  lib/comments/     # The one comment system: the record and the add/edit/delete rules
  lib/storage.ts    # The only module that talks to R2 (or ./.data/ locally)
  lib/http.ts       # problem(), readBody(), throttled() — used by every route
  middleware.ts     # Sends signed-out visitors to the sign-in page
scripts/seed-local.mjs   # Sample data for local work
docs/ARCHITECTURE.md     # How it fits together; CLAUDE.md has the conventions for people and AIs working on it
```

## Testing

- `npm run check` runs lint, the type-check, and the unit tests (`npm test`: vitest over
  `src/**/*.test.ts`, kept beside the code — the paragraph merge, circle
  modules, the route helpers, the comment rules).
- End to end: `npm run seed`, then either `npm run dev` or `npm run build && npm start` with
  `AUTH_SECRET`, `ADMIN_PERSON_IDS` and `EMAIL_TEST_SINK=1` set; sign in through the UI, or
  `POST /api/auth/link {personId}`, read the link from `.data/email-sink.json` and `POST` it to
  `/api/auth/link/<token>`, and exercise the API with curl and the pages with Playwright. Fixtures are
  synthetic: never put real residents in the repository.
- API errors are JSON problem details (`{type, title, status, detail}`); rate limiting is in-memory
  per server instance.

## License

MIT
