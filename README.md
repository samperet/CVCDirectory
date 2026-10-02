# CVC Directory

A mobile-first community directory for residents, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router and Tailwind CSS, with data stored as JSON documents in Cloudflare R2.

## Features

- 🔐 **Resident sign-in** – Pick your name, enter your phone number; signed-out visitors see only the sign-in page.
- 📇 **Directory** – Residents by unit with contact details, circles with open seats, and carshed allocations.
- 🛠️ **Loan Library** – Items residents lend, with lent-out tracking and an "Ask to borrow" button.
- 🌱 **Skills** – What neighbors can help with, each skill listed by the resident who offers it.
- 💬 **Forum** – Neighborhood discussions grouped by topic, with replies nested to any depth.
- 🏡 **Homes for sale** – Admins and the Board list homes for sale, shown with contact details on the public front page.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page, all listed on their own page.
- 🙂 **Profiles** – Residents edit their own details and add a photo.
- 📅 **Calendar** – The next community event on the dashboard, and the full Google Calendar on its own page.
- 📱 **Installable app & notifications** – Add CVC to your home screen, and get push notifications when neighbors post.
- 💡 **Resources** – Local services neighbors recommend, by category, with who recommended each, likes, and comments.
- 📷 **Photos** – A shared gallery of community photos with captions and a full-screen viewer.
- 📚 **One wiki** – Pages with parent circles, each with its own view and edit settings: a visual editor, editing together, embeds, history, and comments on pages or passages. A page reads as a document — its circle's icon, title, date and consent status in the header — and its parent circle can record when it consented to it.
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
- **One profile, several households** – someone listed in more than one unit (e.g. a child whose
  parents live apart) has a single profile listed under each unit. Entries with the same name are
  combined automatically; directory managers can split a combined profile back into separate
  entries ("Split entries", for different people who share a name) or combine entries whose names
  differ ("Same person listed elsewhere?"). "Remove from unit N" takes someone out of one of their
  households and keeps them in the others. Links to a combined entry open the one profile.
- **Search** (`/search`, or "/" anywhere; the header's magnifying glass opens a menu with a search
  box and **All documents**, the way to browse every circle's documents) – one search across the site
  for residents: people (by name, bio, and skills), circles, wiki pages, forum discussions,
  documents (their details and text), tasks, resources, and the loan library. Every word must
  match somewhere in a result; titles count most. Results come in groups, best first, with the
  matching passage quoted and the words marked, and **See all** for a group
  (`GET /api/search?q=…&kind=…`). The query stays in the address, so a search can be shared.
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

## Storage

JSON documents are stored in Cloudflare R2 via the S3-compatible API. Without R2 credentials — or
if R2 is unreachable — the app falls back to `.data/` on disk: fine for local development,
ephemeral on Vercel. `GET /api/health` reports `{ storage: { configured, durable } }` (booleans
only) and returns 503 unless writes are actually reaching R2.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

## Documents

- Each circle's page has a **Documents** section; documents for everyone belong to the Community circle.
  Each document shows its full title, then a line with its type, badges (Consented), circle where
  the list spans circles, date, and who uploaded the current version; Download, versions, and — for
  its managers — Edit, New version, and Delete are icons at the end of that line that appear on
  hover (always, on touch screens). A description shows below.
- **Consent** – a circle's Secretary (and the Board Secretary, and admins) marks a document
  consented, with the date the circle consented (the meeting date by default). It then carries a
  **Consented** badge (its tooltip says when, and who recorded it). Consent belongs to the version
  consented: a newer version shows **Changed since consent** until the Secretary consents again,
  and the version history marks the consented one. **Consented only** filters the list; search
  finds consented documents by the word "consented". The Secretary can withdraw a record of consent.
  (`PUT`/`DELETE /api/documents/<id>/consent`; stored with the document as `consent`.)
- **The wiki** (`/wiki`) – one wiki for all of CVC. Every page has a **parent circle**, and its own
  settings (nothing is inherited): **who can see it** — everyone (the default), only its parent
  circle, or its parent and chosen circles — and **who can edit it** — its parent circle (the
  default; anyone, for Community's pages) or anyone who can see it. The parent circle's members
  (and the Board and admins, who can always see and edit everything) change the parent circle and
  these settings, and can delete the page. A page reads clean: its **Edit** button opens the editor,
  where the page's tools live — **Parent circle**, **Colour**, **Who can see & edit**, and
  **History** (earlier versions to view or restore). A page someone can't see is left out everywhere for them:
  the page list, search, @ search, links ("a page you can't see"), embeds, backlinks, circles'
  Information modules, and notifications. Pages don't nest: they connect by **links** and **embeds** (each page lists what's
  **Linked from** it). The wiki home lists every page you can see, with a search and a filter by
  keeper (`/wiki?keeper=<circleId>`); **New page** asks which of your circles keeps it. A circle's
  **Add Information** starts a page with that circle as its parent (so it shows in the circle's
  Information); **@ new
  page** (and a link to a page that doesn't exist yet) starts a page kept by the same circle as the
  page it was started from. Pages are Markdown, edited in a **visual editor**
  ([MDXEditor](https://mdxeditor.dev), on Lexical) with a simple toolbar: headings, bold/italic,
  lists and checklists, links, photos, tables, collapsible sections, embedded pages, and **polls**;
  Markdown shortcuts work as you type. **Typing @** searches pages and documents and links the one
  you pick — or, for a new title, links a new page (`GET /api/wiki/link-search`). The toolbar's
  **Add a document** button uploads a file into the parent circle's documents and links it. **Links**
  show as **tags**; they're written `[[Page title]]` (titles are unique across the wiki; an older
  `[[O&M:Page title]]` still works) and `[[doc:Document title]]` (`[[doc:O&M:Document title]]` for
  one circle's); any of them takes `|shown text`. **Renaming a page updates the links and embeds
  that point to it.** **Embeds** (`::embed{page="Title" section="Heading"}`) show another page, or
  one section of it, inline and always current, labelled with the circle that keeps it. Changes
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
  on or off (by adding or removing its Tasks module under **Edit page**). The Tasks module's
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
- **Colours** – every page has a colour (white — the default — yellow, orange, red, pink,
  lavender, blue, teal, green, or grey; chosen in the editor by the page's editors): the page is
  drawn in it, and it shows as a card of that colour (title and opening lines) in circles'
  Information modules. (Pages used to be **pinned** to circles, the dashboard, people, tasks,
  documents, and discussions; pinning has been removed. The old `pins.json` is left in storage,
  unused.)
- **Wiki map** (the **Map** button at the top of `/wiki`, for everyone — each sees only the pages they can) –
  **Islands**: each parent circle is a soft island (in its own colour) holding its pages (documents
  aren't shown). Links arc between them. Hovering shows just a name; clicking anything opens a **panel** (docked on the
  right; a sheet along the bottom on phones) with its opening lines, who last edited it, what it
  links to and from — each clickable — plus **Open**, **Zoom to**, and
  **Show connections** (fading everything else). Clicking a circle also zooms in. **3D** shows the
  same as a turnable globe, each circle a sphere with its pages gathered round it (three.js, loaded
  only when chosen); a click flies the camera there and opens the same panel. **Find** zooms to
  anything. Built from `GET /api/wiki/graph` (`/wiki?map=1`;
  `/admin/wiki-map` redirects there).
- **Wiki comments** – anyone signed in comments on a page, or selects a passage and comments on
  that (the passage is highlighted; clicking either jumps to the other). Threads take replies and
  can be resolved and reopened by whoever started them, the page's editors, or an admin; authors
  edit and delete their own (admins any). The page's writers and the thread's participants are
  notified (the "wiki" notification setting). Stored page by page in `wiki/comments/<pageId>.json`;
  a page's comments go with it.
- **A circle's page** – is built from **modules**: **Information** (as many as the circle likes),
  **Members** and **Meetings** (not on Community, which is everyone), the **duty schedule** where
  there is one, **Tasks**, and **Documents** (each of those once). **Edit page** (the circle's members, the Board,
  and admins) adds modules (**Add module**), removes them, drags them into order — or moves them
  with arrows, on phones — and sizes each to a third, half, two thirds, or the full width of wider
  screens; phones stack them. Everyone sees the circle's page as it was saved (stored on the
  circle as `modules`). Each reader can fold any module away with the arrow by its title,
  remembered on their device.
  - An **Information module** has a title ("Information" unless given one) and **Settings**:
    which pages it shows — **Specific pages** (up to 12, searched by title, shown in the order
    chosen), **All pages of a circle** (any circle, by title), or **Recently edited** (3–12, from
    one circle or the whole wiki, newest first) — and how: **Full**, **Summary** (cards with their
    opening lines; the first six, then **+N more**), or **Titles only**. Each reader sees only the
    pages they can. A module listing this circle's own pages has **Add Information** for whoever
    can start pages for the circle.
  - Removing **Tasks** or **Documents** turns them off for the circle (its existing tasks and
    documents are kept, and return when the module is added back); removing **Meetings** keeps its
    minutes and proposals the same way. With Documents off, no new
    documents can be added; its existing ones stay searchable.
  - A circle that hasn't saved its page yet shows what it had before: an Information module with
    all of its own pages, Members, Meetings, its duty schedule, and Tasks and Documents unless they
    were turned off (from the older `layout`, `features`, and `infoView`).
- **Bulk upload** – on `/documents`, **Upload documents** takes up to 50 files at once for one circle,
  chosen from a dropdown of the circles you can add to (your own; every circle for the Board and
  admins). On a circle's own page, **Add documents** does the same for that circle (no dropdown);
  a single file works the same way, and a description can be added afterwards with Edit.
- **Filtering and sorting** – document lists filter by circle (on `/documents`), type, year (on
  `/documents`), and Consented only, and sort by newest (the default), oldest, title, or recently
  updated (best match while searching); **Clear** resets them (`GET /api/documents?sort=…&year=…`). Each file gets an editable title (from its name), type, and meeting date (filled in
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
- **Meetings & minutes** – a circle's **Meetings** module (on by default; not on Community) lists
  its proposals in review and its latest minutes, with **New meeting** for its members, the Board,
  and admins. A meeting's page (`/circles/<id>/meetings/<meetingId>`) is the **Minutes Maker**:
  - **Present** – the circle's members as chips to tick (**All members present** ticks them all),
    plus **Add someone** for any other resident, or a guest by name.
  - **Notes** – Markdown, saved as you type; several people can take notes at once (their changes
    are merged paragraph by paragraph, the same way wiki pages are). **Transcribe** writes down
    what's said using the browser's own speech recognition (Chrome, Edge, Safari — not Firefox),
    adding each phrase as a sentence; it needs no account or key, and labels no speakers. Chrome and
    Edge send the audio to Google or Microsoft to be recognised. **Preview** renders the notes.
  - **Proposals** – added to the meeting as drafts, then **sent for review**: a **5-day consent
    review** (`/circles/<id>/proposals/<proposalId>`), announced to the circle's members (the
    "proposals" notification setting). During it, the circle's own members **log tensions** (with
    replies; marked **addressed** by any member) and can raise a **Reasoned Objection** (a reason
    of at least 10 characters), which **pauses the review**, holding the time it had left. Only the
    objector (or an admin) **withdraws** it, optionally saying what resolved it; once no objection
    stands, the review **resumes with the time it had left**. When the time runs out with no
    objection standing, the proposal is **consented** (worked out as it's read, so nothing has to
    run on a schedule; the members are told once). Proposals can be edited until consented (edits
    during the review are noted in the history), or withdrawn. Everyone signed in can read
    meetings and proposals; a meeting with a proposal that went for review can't be deleted.
  - Stored per circle in `meetings/<circleId>.json` (meetings and proposals together, so an
    objection and the clock it pauses change in one write); deleted with the circle.
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
  `src/**/*.test.ts`, kept beside the code — the paragraph merge, the proposal review clock, circle
  modules, the route helpers, the comment rules).
- End to end: `npm run seed`, then either `npm run dev` or `npm run build && npm start` with
  `AUTH_SECRET` and `ADMIN_PERSON_IDS` set; sign in through the UI or `POST /api/auth/login
  {personId, phone}` and exercise the API with curl and the pages with Playwright. Fixtures are
  synthetic: never put real residents in the repository.
- API errors are JSON problem details (`{type, title, status, detail}`); rate limiting is in-memory
  per server instance.

## License

MIT
