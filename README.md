# Prostor — collaborative online whiteboard

[Русский](README.ru.md) | **English**

An infinite canvas for teams: sticky notes, shapes, mind maps, kanban, documents,
comments, presentations and an AI assistant. Real-time on Yjs (CRDT), offline mode,
version history, SaaS and on-premise.

> **Status:** all 9 planned iterations are done — from authentication and real-time to enterprise features, performance measurements and deployment — plus a 10th round of extras.
> The iteration plan is in the [Roadmap](#roadmap) section.

## Architecture

```
prostor/
├── apps/
│   ├── web/            Next.js 15 (App Router): UI + REST API + Auth.js
│   ├── ws-server/      y-websocket compatible server: JWT, Redis pub/sub, snapshots in Postgres
│   └── worker/         BullMQ: AI (remove-bg, generation), PDF export, email, webhooks, thumbnails
├── packages/
│   ├── db/             Prisma schema + client (shared by web, ws, worker)
│   └── shared/         zod element schemas, permissions, WS protocol, constants
└── docker/             Dockerfiles for web / ws / worker
```

```
 Browser ──HTTP──► web (Next.js) ──► Postgres
    │                  │  └────────► Redis ◄── worker ──► S3 (SeaweedFS), rembg, Replicate, SMTP
    │                  └── enqueues jobs ──┘
    └──WebSocket──► ws-server ×N ◄──Redis pub/sub──► ws-server
                       └── Yjs snapshots ──► Postgres
```

**Why the worker lives in `apps/worker` and not `apps/web/worker`:** it has its own image,
its own deploy cycle and its own dependencies (Replicate SDK, nodemailer). A separate workspace gives
an honest `package.json` and a small Docker image without Next.js. Shared code lives in `packages/*`.

**Why Prisma is in `packages/db`:** the schema is used by three apps; one
source of truth and one client generation.

### Rendering engine: Konva (Canvas2D) + virtualization + LOD

Konva was chosen over PixiJS. Rationale:

- The "10,000 objects" goal means objects *on the board*, not *on screen* at the same time.
  At normal zoom the viewport (+1 screen of buffer) contains 100–1,500 objects;
  an R-tree (`rbush`) selects them in ~0.1 ms, and Konva draws that many at 60 FPS.
- The worst case is zoomed far out, when the whole board is visible. That is covered by **LOD**:
  at `zoom < 0.25` all visible objects are drawn as rectangles in a single
  `Konva.Shape` with a custom `sceneFunc` (one pass instead of 10,000 nodes);
  at `0.25 ≤ zoom < 0.45` nodes are drawn without text (it would be < 6 px on screen anyway).
- Text, rich-text editing, Transformer, hit-testing and events come out of the box with Konva.
  In PixiJS all of that would have to be written by hand, and text in WebGL is a pain of its own
  (Cyrillic, line wrapping, SDF fonts).
- If profiling ever shows CPU rasterization as the bottleneck, the LOD layer can be replaced
  with WebGL (PixiJS) in isolation, without touching the tools.

**How it works (iteration 4a):**

| Technique | Where |
| --- | --- |
| Immutable element snapshots, a new object only for the changed one → `React.memo` by reference | `lib/canvas/element-store.ts` |
| R-tree with point updates from `observeDeep`, bulk-load on open | `lib/canvas/spatial-index.ts` |
| "Viewport + 1 screen of buffer" selection with hysteresis; rebuilt in `startTransition` | `hooks/use-visible-elements.ts` |
| The camera is applied to the Stage imperatively — panning without React renders | `components/canvas/board-canvas.tsx` |
| The grid is the container's CSS background (zero canvas cost) | same |
| Cursors — a separate layer with rAF interpolation, sent at 20 Hz | `lib/canvas/cursors-renderer.ts`, `hooks/use-presence-broadcast.ts` |
| No shadows, `perfectDrawEnabled=false`, `listening=false` until tools need it | `components/canvas/shapes/*` |

**Measurements** (production build, 10,007 objects, Chromium, 1280×720):

| Zoom | Nodes in selection | Pan frame p50 / p95 | Selection rebuild |
| --- | --- | --- | --- |
| 100% | 104 | 1.1 / 2.2 ms | 5 ms |
| 60% | 280 | 2.2 / 3.7 ms | 10 ms |
| 35% (no text) | 816 | 3.3 / 4.1 ms | 17 ms |
| 15% (LOD) | 4,464 | 0.8 / 1.0 ms | — |
| whole board (LOD) | 10,007 | 2.4 / 3.7 ms | — |

Cold open of a 10,000-object board (token → WS → 6 MB state → index → render): ~1 s.
To repeat the measurements: `npm run dev`, then the FPS button on a board → "+10,000 objects"
(the dev panel exists only in dev; for a production bundle build with `NEXT_PUBLIC_CANVAS_DEBUG=1` —
this exposes `window.__prostorCanvas` for scripts).

### Canvas navigation

| Action | How |
| --- | --- |
| Zoom to cursor | Ctrl/Cmd + wheel, trackpad pinch, two fingers on a touch screen |
| Pan | wheel / two fingers on a trackpad, Space + drag, middle button, the Hand tool (H) |
| Zoom level | Ctrl+= / Ctrl+− / Ctrl+0 (100%), Shift+1 — fit all; buttons bottom left |
| Minimap | bottom right: click or drag to jump to a place on the board |

### Tools and keyboard shortcuts

| Tool | Key | How |
| --- | --- | --- |
| Select | V | click, Shift+click (add/remove), marquee; double-click — into a group / edit text |
| Hand | H, hold Space | pan |
| Sticky note | N | click → start typing right away |
| Shape | R (rectangle), O (ellipse) | drag; Shift — square/circle; kind and colors in the tool menu |
| Line / arrow | L / A | drag; Shift — 45° steps; start or end on an object to attach |
| Text | T | click → type; an empty block is removed |
| Table | B | click — a 3×3 table |
| Pen | P | pen, marker, highlighter; color and width in the menu |
| Eraser | E | drag over pen strokes |
| Image | I | pick a file, drop onto the canvas, Ctrl+V |
| Frame | F | drag (click — 16:9); objects inside move, copy and delete with the frame |
| Comment | C | click an object (the pin follows it) or a spot on the board; Shift+C — hide/show |
| Laser pointer | K | everyone sees the trail, it fades in a second |
| PDF import | palette button | or drop a PDF onto the board: each page becomes a frame with an image |

Double-clicking a tool locks it (it does not switch back to Select after creating an object).

| Action | Keys |
| --- | --- |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y |
| Copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V (paste goes under the cursor) |
| Duplicate | Ctrl+D |
| Select all | Ctrl+A |
| Group / ungroup | Ctrl+G / Ctrl+Shift+G |
| Bring to front / send to back | Ctrl+] / Ctrl+[ |
| Lock / unlock | Ctrl+Shift+L |
| Delete | Delete, Backspace |
| Nudge | arrows (Shift — ×10) |
| Edit text | Enter or double-click |
| Find on board | Ctrl+F |
| No snapping while dragging | hold Alt |
| Export PNG / PDF / SVG | Ctrl+Shift+E |
| In text: bold / italic / underline / strikethrough | Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+X |
| In text: list | Ctrl+Shift+8 or "- " at the start of a line |
| In text: to start / end | Ctrl+Home / Ctrl+End |

Tool keys also work in the Russian keyboard layout (by physical key, `e.code`).

### How interactions work (iteration 4b)

- **Custom hit-testing instead of Konva's.** The element layer has no hit graph: hits are computed from the R-tree +
  geometry (`lib/canvas/hit-test.ts`). Konva's hit graph would double the cost of every frame.
  Only the small Transformer layer is interactive.
- **All changes go through `BoardActions`.** One Yjs transaction per action, client-side permission
  checks (role, `allowCopy`, `allowDeleteOthers`, `locked`). Discrete actions start a new undo
  step (`stopCapturing`); gestures (dragging, typing) are merged into one.
- **Live dragging.** For up to 150 objects positions are written to Yjs every frame (colleagues see
  the movement); for more, only the Konva nodes move and the result is written to Yjs at the end.
- **Snapping.** Edges and centers of nearby objects (6 screen px threshold) with red guides,
  optionally a 20 px grid. Alt disables it temporarily.
- **Text is edited in an HTML textarea over the canvas** (scaled and rotated with the object):
  IME, spell checking and selection work natively.
- **Images** are uploaded via `POST /api/boards/:id/assets` (file signature check,
  SHA-256 deduplication) and served via `GET /api/assets/:id` with a permission check — same-origin,
  so PNG/PDF export never hits a "tainted" canvas.
- **The canvas is always light.** Object colors are shared by all participants; the dark theme applies to the UI.

## Quick start (local development)

> **If sign-in says "no connection to the database"** — the containers are not running (often after a
> computer restart): start Docker Desktop and run `npm run infra:up`.

Requirements: Node.js ≥ 20.11 (22 recommended), Docker.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run infra:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

| Service | Address |
| -------------- | ----------------------------------------- |
| Web | http://localhost:3000 |
| WS server | ws://localhost:1234 (health: `/health`) |
| S3 (SeaweedFS) | http://localhost:9000 (keys `S3_ACCESS_KEY` / `S3_SECRET_KEY`) |
| Mailpit (email) | http://localhost:8025 |

Demo accounts after seeding: `demo@prostor.local`, `alice@prostor.local`, password from `SEED_PASSWORD`.

> **Local S3 is SeaweedFS.** Since late 2025 MinIO no longer publishes Docker images, so
> docker-compose starts SeaweedFS (Apache-2.0) with an S3 API on port 9000. The app works
> with any S3-compatible storage — in production just change `S3_*`.
>
> **Windows:** `npm run db:generate` (and `typecheck`, which calls it) fails with `EPERM`
> while web/ws/worker are running — the Prisma engine is locked by the process. Stop them before generating.
> In PowerShell run npm as `npm.cmd` if script execution is disabled.

### Scripts

| Command | What it does |
| -------------------- | ------------------------------------------------- |
| `npm run dev` | web + ws + worker in parallel |
| `npm run build` | production build of all apps |
| `npm run typecheck` | `tsc --noEmit` in all workspaces |
| `npm run lint` | ESLint (web) |
| `npm test` | Vitest (unit tests of all packages) |
| `npm run test:e2e` | Playwright (apps/web/e2e), see "E2E tests" |
| `npm run db:migrate` | create/apply a migration (dev) |
| `npm run db:deploy` | apply migrations (prod) |
| `npm run db:studio` | Prisma Studio |

### E2E tests

Playwright runs against a **production build** of web: the dev server with on-demand compilation and HMR
cannot handle parallel scenarios with several browsers on one board.

```bash
docker compose up -d postgres redis s3 mailpit
npm run dev:ws        # in a separate terminal
npm run dev:worker    # in a separate terminal (with AI_PROVIDER_IMAGE=mock)
npm run test:e2e -w @prostor/web
```

Playwright starts web itself: `build:e2e` (a build with the canvas debug hook
`NEXT_PUBLIC_CANVAS_DEBUG=1`, into a separate `.next-e2e` folder) and `start:e2e` — with `RATE_LIMIT_MULTIPLIER=50`
(tests register dozens of users from one IP) and `NOTIFICATION_EMAIL_DELAY_MS=3000` (comment emails
are checked through Mailpit). Against a ready environment: `E2E_BASE_URL=https://… npm run test:e2e -w @prostor/web`.

## On-premise (Docker Compose)

The whole stack with one command — web, ws, worker, Postgres, Redis, S3 (SeaweedFS), migrations:

```bash
cp .env.example .env
```

Edit `.env`: be sure to change `AUTH_SECRET`, `WS_JWT_SECRET`,
`AUTH_ENCRYPTION_KEY`, the Postgres password and `S3_ACCESS_KEY`/`S3_SECRET_KEY`; set `APP_URL`, `WS_PUBLIC_URL`,
`S3_PUBLIC_ENDPOINT`. Production SMTP for the containers is `SMTP_URL_DOCKER` (by default email goes
to Mailpit from the `dev` profile). Then:

```bash
docker compose up -d --build
```

With local background removal (no external APIs — suitable for an air-gapped network):

```bash
docker compose --profile ai up -d --build
```

Production recommendations:

- Put a reverse proxy with TLS in front: `/` → web:3000, `wss://…/ws` → ws:1234 — a ready example is
  [deploy/nginx/prostor.conf](deploy/nginx/prostor.conf) (WebSocket, timeouts, upload limits).
- The WS server scales horizontally (`--scale ws=3`): rooms are synchronized through Redis.
- The WS address is given to the client at runtime (`WS_PUBLIC_URL`), so one image works on any domain.
- Backups: `pg_dump` (boards, versions) + a copy of the bucket (`aws s3 sync` against the S3 endpoint).
- For closed networks (e.g. in Russia): Yandex ID and VK ID instead of Google/GitHub, LLM through an
  OpenAI-compatible gateway (`LLM_BASE_URL`), S3 — the built-in SeaweedFS or Yandex Object Storage.

## Environment variables

The full commented list is in [.env.example](.env.example). Key ones:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | public web address |
| `DATABASE_URL` | Postgres (with PgBouncer, run migrations against the direct address) |
| `REDIS_URL` | queues, pub/sub between WS instances |
| `AUTH_SECRET`, `AUTH_ENCRYPTION_KEY` | Auth.js and encryption of TOTP secrets |
| `AUTH_{GOOGLE,GITHUB,YANDEX,VK}_{ID,SECRET}` | OAuth (empty — provider hidden) |
| `WS_JWT_SECRET`, `WS_PUBLIC_URL`, `WS_ALLOWED_ORIGINS` | WS server |
| `S3_*` | file storage (SeaweedFS / R2 / S3 / Yandex Object Storage) |
| `SMTP_URL`, `EMAIL_FROM` | email (invitations, password reset, notifications) |
| `SMTP_URL_DOCKER` | SMTP for docker compose containers (Mailpit by default) |
| `NOTIFICATION_EMAIL_DELAY_MS` | delay before emailing about an unread mention (2 min) |
| `AUTH_OIDC_ISSUER`, `AUTH_OIDC_ID`, `AUTH_OIDC_SECRET`, `AUTH_OIDC_NAME` | corporate SSO (OpenID Connect) |
| `OUTBOUND_PROXY` | HTTP proxy for server requests to the internet (link previews, fonts, images) |
| `PEXELS_API_KEY` | free Pexels key for the image feed (without it — Wikimedia Commons only) |
| `AI_PROVIDER_IMAGE`, `POLLINATIONS_TOKEN` | image generation: pollinations (free), replicate, mock |
| `RATE_LIMIT_MULTIPLIER` | rate-limit multiplier (1 in production; 50 for the e2e environment) |
| `AI_PROVIDER_REMOVE_BG`, `REMBG_URL`, `REPLICATE_API_TOKEN`, `LLM_*` | AI |

## Authentication

Auth.js v5 (JWT sessions) + a Prisma adapter for OAuth accounts.

| Method | Details |
| --- | --- |
| Email + password | scrypt (N=2¹⁵, r=8: native, in the thread pool — does not block the server); old bcrypt hashes are rehashed on sign-in. Rate limits per IP and email in Redis, identical response time for non-existent emails |
| Google, Yandex ID | automatic linking to an existing account with the same email (providers verify the email) |
| GitHub, VK ID | no automatic linking; VK without an email gets a technical address `vk-<id>@users.prostor.invalid` |

Callback URL for setting up the app at the provider: `{APP_URL}/api/auth/callback/{google|github|yandex|vk}`.
A provider button appears automatically once its `AUTH_*_ID` and `AUTH_*_SECRET` are set.

- **Password reset**: the link lives for 60 minutes, only the SHA-256 of the token is stored. After a reset
  `User.sessionVersion` is incremented — sessions on other devices expire (within the 60 s cache).
- **Closed sign-up** (`ALLOW_SIGNUP=false`): new accounts cannot be created via the form or OAuth.
- **Middleware** (Edge) lets only signed-in users into `/dashboard`, `/board`, `/settings`; checks for
  blocking and password changes happen in `auth()` on the server.
- If the database is unavailable, sign-in and API requests answer with a clear message (503) instead of a generic error.
- REST: `POST /api/account/register`, `/api/account/forgot-password`, `/api/account/reset-password`.
- Check emails locally in Mailpit: http://localhost:8025.

## Real-time and offline

Board content is a Yjs document (CRDT); Postgres stores its binary state.

```
browser: Y.Doc ◄─► y-indexeddb (offline copy)
            └─► y-websocket ──JWT──► ws-server ──Redis Pub/Sub──► ws-server (other instances)
                                         └── debounce 2 s ─► BoardDocument
                                         └── debounce 30 s ─► BoardSnapshot (version history)
```

- **Connection.** The client gets a 5-minute JWT from `POST /api/boards/:id/ws-token` (along with the WS
  address) and refreshes it in advance; on close with code 4401 the token is refreshed and y-websocket
  reconnects by itself. Codes 4403/4404 — access revoked or board deleted.
- **Permissions.** The WS server rechecks the role in the database on connect. From VIEWER/GUEST only
  sync step1 (state request) is accepted — changes are dropped. Role changes and board deletion
  arrive from web through the Redis channel `prostor:control` and take effect immediately.
- **Awareness.** The name and color in the cursor are taken by the server from the JWT, not from the client — you
  cannot impersonate a colleague.
- **Multiple instances.** Updates are relayed through Redis. A new instance, after loading from the
  database, asks the others for what is missing (state vector), and writes to `BoardDocument` happen under
  `SELECT … FOR UPDATE` with a CRDT merge, so instances never overwrite each other's changes.
- **Snapshots.** AUTO — debounce 30 s (at least every 5 min), LAST_CLIENT — when the last
  client leaves; duplicates between instances are prevented by a Redis lock. The last 200 AUTO versions are kept.
- **Offline.** Changes accumulate in IndexedDB; after reconnecting Yjs merges them without
  conflicts. Header indicator: Offline / Connecting / Syncing / Saved.
- **Undo/redo.** `Y.UndoManager` with `trackedOrigins = {'local'}`: only your own actions are undone.

## AI features

All AI jobs are asynchronous:

```
browser ──POST /api/ai/remove-bg | generate-image──► web ──► AiJob (Postgres, QUEUED)
                                                          └─► BullMQ (Redis) ──► worker
browser ◄──GET /api/ai/jobs/:id (polling 0.8–3 s)── web ◄── AiJob: RUNNING → progress → SUCCEEDED
                                                    worker ──► provider ──► S3 ──► new Asset
```

- **Background removal** — image context menu (right click) or a button in the selection toolbar.
  The result is a new asset; only `assetId` changes in the element, so Ctrl+Z brings back the original.
  Transparent margins are trimmed around the object, and the element stays in the same place on the board.
  If a colleague replaced the image while it was being processed, the result is placed next to it.
- **Image generation** — the ✨ button in the toolbar: a description and a format (1:1, 16:9, 9:16, 4:3, 3:4).
  The dialog closes immediately; a progress indicator appears on the board where the image will be.
- **Providers** (`AI_PROVIDER_REMOVE_BG`, `AI_PROVIDER_IMAGE`):

  | Feature | Provider | When |
  | --- | --- | --- |
  | Background removal | `local` — rembg in Docker | on-prem, closed network: images never leave the server |
  | Background removal | `replicate` | SaaS without GPU/CPU resources for rembg |
  | Generation | `pollinations` (Flux, free; non-English prompts are translated first) | default; without a key — 1 image per 45 s and a small logo, `POLLINATIONS_TOKEN` removes both |
  | Generation | `replicate` (Flux Schnell by default) | SaaS |
  | Generation | `mock` — a gradient from the prompt hash | development, e2e, demos without AI access |
  | Any | `disabled` | buttons hidden, the API answers 503 |

- **Local rembg:** `docker compose --profile ai up -d rembg` (image ~1.6 GB, the ~170 MB model
  is downloaded on the first request into the `rembgmodels` volume; model — `REMBG_MODEL`).
- **Tested on a real photo** (white tiger in the jungle, 1000×667, model `isnet-general-use`, CPU):
  first request ~29 s (model loading), then ~1.2–1.5 s per image; the background is transparent on 74%
  of the area, the object is fully opaque. To repeat: `docker compose --profile ai up -d rembg`, then
  `E2E_REMBG_PHOTO=/path/to/photo.jpg npm run test:e2e -w @prostor/web -- -g "реальном фото"`.
- **Reliability:** the job is stored in Postgres, BullMQ is only transport. Network failures and provider 5xx —
  up to 3 attempts with exponential backoff; model refusals and invalid input — FAILED right away with a clear
  message. The provider response is checked by file signature and limited to 40 MB.
- **Limits:** background removal — 60 per hour, generation — 30 per hour, at most 5 unfinished jobs per
  user; background removal — PNG/JPEG/WebP only.

## Sharing

The **"Share"** button in the board header opens a dialog with "Invite", "Members",
"Links" and "Access" tabs; the same settings are on the `/board/:id/settings` page
(plus name, description, deleting or leaving the board). Account — `/settings`:
name, changing or setting a password for the first time, "Sign out on all devices", language, API keys and webhooks.

| Role | Can |
| --- | --- |
| Owner | everything, including member roles, visibility and deleting the board |
| Editor | edit, invite (with a role no higher than their own) |
| Viewer | view, comment |
| Guest | view only |

- **Invite links:** role, expiry (1 / 7 / 30 days, never) and a usage limit. Only the SHA-256 of the token
  is stored, so the link is shown once — right after creation; it can be revoked at any time.
  Uses are counted atomically (`UPDATE … WHERE uses < maxUses`); accepting never lowers a role already granted.
- **Email invitations:** up to 20 addresses at a time, a personal message, a one-time 14-day link
  that can only be accepted from the account with that email. Registered users also get a notification.
  Limit — 50 emails per hour per user.
- **The `/board/:id/join` page:** without signing in it offers to sign up or sign in and comes back;
  it explains why an invitation does not work (revoked, expired, used up, different email).
- **Visibility:** private, the whole organization (for organization boards) and public read-only —
  unless the organization forbids it (`allowPublicBoards`).
- **Applied immediately.** Changing a role, removing a member or changing visibility publishes an `access-changed` event;
  the WS server rechecks the permissions of every connection: a downgraded user gets `role-changed`
  (writing is blocked without a reload), a user who lost access is disconnected with code 4403.

## Frames, templates, export and versions

- **Frames** (F) — "slide" areas. Membership in a frame is determined by the object's center: move the
  center inside — the object is in the frame. A frame moves, copies and deletes together with its content
  and is drawn below all objects; the frame list and navigation — the "Frames" button at the top right.
- **Templates** (mind map, kanban, retro, flowchart, BPMN, SWOT, story map) — ordinary elements
  written into the board document on creation: you can edit them right away, and Ctrl+Z does not "undo" them.
- **Export** (Ctrl+Shift+E) is assembled in the browser — the client already has the data; the server only
  checks the permission (the `allowExport` policy) and writes an audit record:
  - **PNG** — the same Konva components on an offscreen Stage, 1×/2×/4× scale, transparent background;
    the size is capped so a huge board does not hit the browser's canvas limit;
  - **PDF** — one page per frame (presentation order) or the whole board; 2× raster as JPEG, assembled in a Web Worker;
  - **SVG with layers** — every frame is a layer (`inkscape:groupmode="layer"`), groups are nested `<g>`,
    text is `<text>` with the same line breaks as on the canvas, images are embedded as data: URLs.
- **Version history** (clock icon in the header, for editors): automatic WS server snapshots and manually saved ones.
  Previewing a version swaps the document on the canvas (read-only; objects can be copied with Ctrl+C).
  "Restore" is an ordinary CRDT edit of the live document in one transaction: colleagues get the
  update, Ctrl+Z undoes the restore, and a "Before restore" version is saved automatically first.

## Rich text

Sticky notes, shapes and text blocks are edited with ProseMirror bound to the element's `Y.XmlFragment`
via y-prosemirror: several people edit one sticky note character by character and see each other's cursors.
Bold, italic, underline, strikethrough and bulleted lists are supported. On the canvas,
formatted text is drawn by a custom Konva.Shape with the same line layout as the export;
plain text still uses the fast `Konva.Text`. The `text` field remains a plain copy for search.
Objects created before iteration 7 get a `Y.XmlFragment` the first time the editor is opened.

## Comments and notifications

- The Comment tool (C): a thread on an object (the pin follows it) or on a spot on the canvas. Replies,
  reactions, editing and deleting your own, "Resolved". Viewers and above can comment; an anonymous user on a
  public board sees discussions but cannot write.
- **Mentions** `@` — suggestions from board members; you can mention only people who have access.
- Comment bodies live in Postgres (their own permissions, notifications, and the board document does not grow from chatter);
  clients refresh on the `comments-changed` event from the WS server.
- **Notifications**: mentioned users and thread participants — the bell in the header. An email goes through the
  `prostor-email` queue with a delay (`NOTIFICATION_EMAIL_DELAY_MS`, 2 minutes): read it in the app —
  no email. Can be disabled in account settings; without `SMTP_URL` the worker sends no email.

## Facilitation

- **Follow mode**: click a participant's avatar → "Follow". "Ask everyone to follow me" (your own avatar) —
  others automatically follow the presenter; moving your own camera stops following.
- **Laser pointer** (K) — a trail through awareness (~25 updates/s), fades in a second.
- **Timer** — one per board in Yjs: everyone sees the countdown, editors control it; a signal at the end.
- **Voting** — a topic and the number of votes per person; clicking an object casts a vote, clicking the badge takes it back.
  Votes are stored in Postgres (viewers vote too, though WS does not let them change the document); the limit
  is checked on the server under a lock. Other people's votes are hidden until the end, then — the ranking.
- **PDF import** — pages are rendered in the browser (pdf.js, `isEvalSupported: false` against
  CVE-2024-4367), uploaded as images and laid out as frames (up to 50 pages).

## Enterprise: organizations, folders, policies, audit, 2FA, SSO

- **Organizations** — a team space: the "+" button next to "Organizations" on the dashboard,
  settings — `/org/<id>/settings`. Roles: owner, admin (editor on organization boards),
  member (sees boards with "Organization" visibility). A board created in an organization is visible
  to the whole organization by default. New users with an email from the "auto-join domains" join automatically.
- **Folders with inherited permissions** — a tree in the sidebar. Access to a folder (member + role) applies to
  all boards of the folder and its subfolders; permissions are computed from a materialized path (`Folder.path`),
  without recursive queries. Moving a folder rewrites the subtree path with a single `UPDATE`.
  Deleting a folder does not delete boards — they move to the root and stay with their owners.
- **Organization policies** ("Policies" tab): export, copying, deleting other people's objects,
  public boards, guest permissions. Changes take effect immediately on open boards: web publishes
  `access-changed`, and the WS server recomputes the role and policy of every connection.
- **Deleting other people's objects is enforced on the server.** A Yjs update cannot be dropped (the CRDT would diverge), so
  the WS server parses the update's delete set before applying it, and if an editor deleted someone else's object
  (when the policy forbids it) or a locked one, it immediately restores it with a compensating server
  transaction — all clients, including the author, converge to the same state. The event is written to the audit log.
- **Audit log** — for the organization (admins) and for a board (owner): sign-ins, access,
  export, versions, policies, API keys and webhooks, blocked deletions. Filter by action, pagination, CSV export
  (UTF-8 with BOM, ";", protection against CSV injection).
- **2FA (TOTP, RFC 6238)** — in account settings: a QR code for an authenticator app, confirmation
  with a code, 10 one-time backup codes (stored as hashes). The secret is encrypted with AES-256-GCM using the
  `AUTH_ENCRYPTION_KEY`; reuse of an already used code is blocked. An organization can make 2FA
  mandatory — without it a member cannot open its boards.
- **SSO via OpenID Connect** (Keycloak, ADFS, Azure AD, Okta…): set `AUTH_OIDC_ISSUER`,
  `AUTH_OIDC_ID`, `AUTH_OIDC_SECRET`, `AUTH_OIDC_NAME` — a button appears on the sign-in page.
  SAML providers are connected through Keycloak as a broker (SAML → OIDC). The app's 2FA applies
  to password sign-in; with SSO the second factor is provided by the corporate IdP.
- **Passwords** are hashed with scrypt (native, does not block the server); old bcrypt hashes are rehashed on sign-in.

## Arrows, presentations, search, tables, links

- **Arrows attached to objects.** Start or end an arrow (A) or a line (L) on an object —
  the end attaches: to the middle of a side (if released near it) or to the nearest point of the border.
  When the object moves or is resized, the arrow follows it (in the same undo step). Routing:
  straight, elbow (right angles) or curved; a label in the middle; arrowheads on both ends.
  A selected line has endpoint handles: drag one onto another object to reattach, or into empty space
  to detach. An arrow moved on its own detaches from objects; a copy detaches from the originals.
- **Presentation mode** ("Present" or the frame list): slides are frames in the chosen order
  (arrows in the "Frames" panel), full screen, smooth transitions. →/Space/click — next, ← — back,
  N — speaker notes (editors can edit them during the show), "Everyone follow me" — participants'
  cameras follow the presenter, Esc — exit.
- **Find on board (Ctrl+F):** sticky notes, text, shapes, frame names, arrow labels, table cells,
  notes and comments; case-insensitive and treats "ё" as "е". Enter / Shift+Enter — next/previous,
  the camera moves to the match.
- **Tables (B):** cells are stored as separate Yjs fields, so two people can edit
  different cells at the same time. Double-click — edit, Tab/Shift+Tab — neighboring cell (Tab in the last one
  adds a row), Enter — the cell below. Rows and columns are added and removed from the selection toolbar;
  the first row is a header.
- **Links and embeds:** paste a link onto the board (Ctrl+V) or press "Link" in the palette.
  The server builds a preview (Open Graph/oEmbed; the image is stored as a board asset — export works);
  for YouTube, Vimeo, Loom, Figma, Google Docs/Sheets/Slides and Miro a double-click opens
  a live player over the card, ordinary sites open in a new tab. Page fetching is protected
  against SSRF: internal addresses, non-standard ports and redirects into the internal network are forbidden.
  If the server reaches the internet through a proxy (a VPN client), set `OUTBOUND_PROXY`.

## Fonts, stickers, images, audio and interface language

- **Fonts.** Sticky notes, text and shapes have a font menu in the selection toolbar: the whole Google Fonts catalog
  (about 1,950 families) with search, a "Cyrillic only" filter and a preview of each name in its own
  font. The catalog, CSS and font files go through the Prostor server (`/api/fonts/*`, cached in Redis):
  the browser needs no direct access to Google, and participants do not send it their IPs. **A custom font**
  (TTF, OTF, WOFF, WOFF2, up to 10 MB) is uploaded to the board and loaded for all participants.
- **Sticker library** (smiley button in the palette): about 18,000 free emoji from open
  sets — Fluent Emoji and Fluent Emoji Flat (MIT), Noto Emoji (Apache 2.0), Twemoji (CC BY 4.0),
  OpenMoji (CC BY-SA 4.0) — via the Iconify API. Search in Russian and English, categories, set
  selection; a sticker is stored as a board image (export, offline, visible to colleagues). Licenses are shown
  in the panel; CC BY/BY-SA require attribution when published.
- **Image cropping:** double-click an image (or "Crop" in the toolbar) — a frame with handles,
  aspect ratios 1:1, 4:3, 16:9, 3:4, original; Enter — done, Esc — cancel. The original is never damaged:
  "Reset" brings the whole image back. Cropping is preserved in PNG, PDF and SVG export.
- **Image feed** (images button in the palette) — search and inspiration in the spirit of Pinterest: a two-column
  grid with infinite scroll, collections (nature, architecture, interior…), search in Russian
  and English. The source is free images from Wikimedia Commons, and with a free
  `PEXELS_API_KEY` — Pexels photos as well. An image can be added to the board with a button or by dragging,
  copied to the clipboard (paste it anywhere) or opened at its source; the author and license
  are kept in the image caption. Pinterest itself is not used: it has no open API,
  and its images are protected by copyright.
- **Audio** (music note button in the palette): upload MP3, WAV, OGG, M4A, AAC, FLAC, WebM up to 50 MB,
  record a voice note from the microphone (up to 10 minutes), or simply drop a file onto the board.
  On the board — a card with a title, duration and a "waveform"; double-click opens a player with pause,
  seeking (the server serves files in ranges, HTTP Range), volume and speed.
- **Interface language:** Russian and English (switcher in the user menu, on the sign-in page and in
  settings; defaults to the browser language). The translation key is the Russian string itself (`t('Вход')`);
  the test `lib/i18n/i18n.test.ts` checks that every string has an English translation.
  API error messages are Russian only for now.

## Public API and webhooks

**API keys** are created in "Settings → API keys" (the key is shown once; only its
SHA-256 is stored). A key acts on your behalf with your permissions on boards: "read only" or
"read and write". Limit — 600 requests per minute per key.

```bash
curl -H "Authorization: Bearer pst_…" http://localhost:3000/api/v1/boards
```

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/v1/me` | key owner |
| GET | `/api/v1/boards?q=…` | accessible boards |
| POST | `/api/v1/boards` `{ title }` | new board (scope write) |
| GET | `/api/v1/boards/:id` | board details and your role |
| GET | `/api/v1/boards/:id/elements?type=sticky` | board objects |
| POST | `/api/v1/boards/:id/elements` | add objects (scope write) |

Creating objects: `{ "elements": [{ "type": "sticky", "text": "Task", "color": "#bbf7d0", "x": 0, "y": 0 }] }`
(`type`: sticky, text, shape; without coordinates objects are placed below the board content). The change
is written to the board document and immediately broadcast to open clients through Redis — participants see
new objects without reloading. Errors — `{ "error": { "code", "message", "fields" } }`.

**Webhooks** ("Settings → Webhooks"): a JSON POST to your URL on the events `board.created`,
`board.updated` (after an automatic version snapshot, at most once every few minutes), `board.deleted`,
`element.created`, `comment.created`, `comment.resolved`, `voting.closed`. Body:
`{ id, event, occurredAt, board: { id, title, url }, actor, data }`. Headers `X-Prostor-Event`,
`X-Prostor-Delivery` and `X-Prostor-Signature: sha256=<hex HMAC-SHA256(secret, body)>`.
Delivered by the worker with retries (5 attempts, exponential backoff); 4xx are not retried,
after 15 failures in a row the webhook is disabled. Only users who have access to the board
at the time of the event receive it. The "Send test event" button sends a `ping` event.

Verifying the signature (Node.js):

```js
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-prostor-signature']));
```

## Performance and load

All measurements are on an ordinary laptop (Windows, headless Chromium, production build); they are repeated
by tests in the repository.

**Canvas core, 10,000 objects** (`apps/web/src/lib/canvas/perf.test.ts`, budgets are checked in CI):

| Operation | Time |
| --- | --- |
| Reading the document into ElementStore + R-tree bulk-load | 47 ms |
| Visible-area query (1920×1080 screen) | 0.03 ms (p95 0.09) |
| Hit-test under the cursor | 0.003 ms |
| Point update of one object (without rebuilding the index) | < 2 ms |
| Yjs document with 10,000 objects | ~5.6 MB |

**Browser, 10,000 objects** (`e2e/perf.spec.ts`):

| Scenario | Result |
| --- | --- |
| Panning at 100% | 60 FPS, frame p95 16.7 ms |
| Panning the whole board (LOD) | 60 FPS, frame p95 16.7 ms |
| Generating 10,000 objects in one transaction | 0.4 s |
| Reopening the board (IndexedDB + WS sync + index) | 0.7 s |
| Export SVG / PNG / PDF | 0.3 / 2.6 / 2.7 s |

**Export without freezes.** The offscreen scene mounts Konva nodes in chunks (not 10,000 in one React
commit), PNG/JPEG are encoded asynchronously (`canvas.toBlob`), the PDF is assembled in a **Web Worker**
(`lib/export/pdf.worker.ts`), and PDF import renders pages in the pdf.js worker. One main-thread pause
remains — the synchronous Konva draw of the whole scene (~1 s for 10,000 objects): Konva needs the DOM
and cannot be moved to a worker. Hit-testing is deliberately kept off workers: the R-tree answers in microseconds,
and round-tripping to a worker would cost more than the search itself.

**WS server** (`npm run load-test -w @prostor/ws-server -- --clients N --rate R --seconds S`): N real
Yjs clients on one board move their sticky notes, each client measures the delivery latency of others' edits.

| Clients × edits/s | Deliveries per second | Delivered | Latency p50 / p95 / p99 |
| --- | --- | --- | --- |
| 30 × 5 | 3,869 | 100% | 11 / 19 / 24 ms |
| 100 × 5 | 31,914 | 100% | 169 / 320 / 378 ms |

At 100 clients the generator itself is the bottleneck: all 100 Y.Docs live in one Node process and apply
~32,000 updates per second (instead of the planned 500 edits/s it managed to send 322). To evaluate
the server under heavier load, run several generators from different machines; WS instances
scale horizontally through Redis.

## Cloud deployment (SaaS)

The WS server holds long-lived connections and **does not run on Vercel** (serverless).
A typical setup:

| Component | Where |
| --- | --- |
| web | Vercel or Fly.io (`deploy/fly/web.fly.toml`) |
| ws-server | Fly.io (`deploy/fly/ws.fly.toml`), Railway, VPS |
| worker | Fly.io (`deploy/fly/worker.fly.toml`), Railway, VPS |
| Postgres | Neon / Supabase / Railway / managed PG |
| Redis | Upstash (TLS, `rediss://`) / Railway |
| S3 | Cloudflare R2 / AWS S3 / Yandex Object Storage |

**Step by step (Vercel + Fly.io):**

1. Create Postgres, Redis and an S3 bucket; fill in `.env` from `.env.example` (secrets — random:
   `openssl rand -hex 32`).
2. Migrations — once, from a developer machine or CI:
   `DATABASE_URL=… npm run db:deploy`.
3. WS server and worker (from the repository root):
   ```bash
   fly launch --config deploy/fly/ws.fly.toml --dockerfile docker/Dockerfile.ws --no-deploy
   fly secrets set --config deploy/fly/ws.fly.toml DATABASE_URL=… REDIS_URL=… WS_JWT_SECRET=… WS_ALLOWED_ORIGINS=https://app.example.com
   fly deploy --config deploy/fly/ws.fly.toml --dockerfile docker/Dockerfile.ws .
   ```
   The same for `deploy/fly/worker.fly.toml` with `docker/Dockerfile.worker`.
4. web on Vercel: Root Directory — `apps/web`, Install Command — `cd ../.. && npm ci`,
   Build Command — `cd ../.. && npm run db:generate && npm run build -w @prostor/web`.
   Variables — all from `.env.example`, `WS_PUBLIC_URL=wss://prostor-ws.fly.dev`.
5. OAuth providers: callback `{APP_URL}/api/auth/callback/{provider}`.

web gives `WS_PUBLIC_URL` to the client at runtime, so changing the WS domain does not require a rebuild.

## Roadmap

- [x] **1. Foundation** — monorepo, Prisma schema, docker-compose, configs, layout
- [x] **2. Authentication** — Auth.js (email+password, Google, GitHub, Yandex, VK), password reset, middleware
- [x] **3. Real-time** — WS server (Yjs + JWT + Redis + Postgres), `useYjs` + y-indexeddb, dashboard
- [x] **4a. Canvas** — Konva Stage, zoom/pan, grid, minimap, cursors, virtualization
- [x] **4b. Tools** — sticky notes, shapes, text, pen, Transformer, undo/redo, snapping
- [x] **5. AI** — background removal, image generation, BullMQ, progress
- [x] **6. Sharing** — invite links, email invitations, roles, ShareDialog, board and account settings
- [x] **7. Extra features** — frames, templates, PNG/PDF/SVG export, version history, rich text, comments and notifications, follow mode, laser, timer, voting, PDF import
- [x] **8. Enterprise** — organizations, folders with inherited permissions, policies (with server-side protection against deleting others' objects), audit log with CSV, 2FA (TOTP), SSO (OIDC)
- [x] **9. Performance and tests** — budgets for 10,000 objects (unit and browser), freeze-free export (Web Worker for PDF), WS load test, Docker images for the whole stack, deploy configs (Fly.io, nginx)
- [x] **10. Extras** — attached arrows, presentations, search, tables, embeds, public API and webhooks, English interface, all Google fonts and custom fonts, sticker library, image cropping, image feed, audio
