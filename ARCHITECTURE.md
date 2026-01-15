# MyLeaf Architecture

## Decisions (Jan 2026)
- **App server:** Standard Next.js App Router (`next dev` / `next start`) — no custom `server.ts`.
- **Deploy target:** A VM running Docker.
- **Deploy unit:** A single Docker container (per requirements).
- **Accounts:** Authenticated users (not anonymous rooms).

## System Overview
MyLeaf is a **single-container monolith** focused on deployability and performance.

Within that one container we will run:
- A **Next.js web app** (UI + API routes).
- A **WebSocket sync service** (Yjs) as a separate Node process on a second port.
- A **local SQLite database** (file-based) accessed via Prisma.

This keeps development simple (standard Next.js) while meeting the “single Docker container” requirement.

## Tech Stack

- **Frontend:** Next.js (React / TypeScript)
- **Styling:** Tailwind CSS
- **Editor:** CodeMirror 6 (planned)
- **Collaboration:** Yjs (CRDT) + `y-websocket` (planned)
- **Backend:** Next.js route handlers (App Router)
- **Database:** SQLite (via Prisma) — chosen for zero-config, single-container deploys
- **LaTeX Engine:** Tectonic (preferred) or TeX Live (executed via child process)

## Component Design

### 1. Web App (Next.js)
The web app runs as a standard Next.js server.
- **UI:** App Router pages and components.
- **API:** Route handlers for compile, project CRUD, and auth.
- **Why standard Next:** Less maintenance than a custom server while still supporting everything we need.

### 2. Collaboration (Yjs)
- **Conflict Resolution:** Uses CRDTs (Conflict-free Replicated Data Types) to merge changes from multiple users without locking.
- **Data Flow:**
    1.  Client makes a change in CodeMirror.
    2.  Change is captured by `y-codemirror`.
    3.  Update is sent to the **sync service** via WebSocket.
    4.  Sync service broadcasts updates to all other connected clients.

#### Sync service process
The sync service is a separate Node process (e.g., `y-websocket`) running inside the same container.
- It listens on its own port (e.g., `:1234`).
- The Next.js app serves the UI/API on `:3000`.
- Clients connect to the sync service via an environment variable like `NEXT_PUBLIC_SYNC_URL`.

Persistence strategy (phased):
- MVP: collaboration is real-time only; persistence happens via explicit “Save”/autosave calls to the Next.js API.
- Later: sync service can persist document updates (either directly to DB or via the API).

### 3. Compilation Pipeline
- **Trigger:** User clicks "Compile" or enables "Auto-compile".
- **Process:**
    1.  Frontend sends current document content to `POST /api/compile`.
    2.  Backend writes content to a temporary isolated directory.
    3.  Backend spawns a child process: `tectonic main.tex`.
    4.  On success, the generated PDF is streamed back to the client.
    5.  Temporary files are cleaned up.

#### Safety / hardening requirements (non-optional)
Because compilation executes untrusted input, the compile endpoint must include:
- Strict timeouts and output size caps.
- Per-request temp dirs with random names; never reuse paths.
- Input size limits and request rate limiting.
- No shell-escape and no access outside the temp dir.
- Cleanup on success/failure.

### 4. Deployment Model (Docker on a VM)
The Docker image is self-contained:
- Base Layer: Debian/Alpine.
- Dependencies: Node.js + Tectonic (LaTeX engine).
- App Layer: Built Next.js application.
- Data Layer: SQLite DB file stored on a mounted volume.

Runtime processes inside the container:
- `next start` for the web app.
- a `y-websocket` server for collaboration.

Note: running two processes in one container is a pragmatic trade-off to satisfy the “single container” requirement. A simple entrypoint script can start both processes.

## Delivery Plan (phased)
1. **UI shell:** split-pane layout, resizable panels, editor/preview placeholders.
2. **Auth + projects:** accounts, sessions, create/open projects and documents.
3. **Compile MVP:** `/api/compile` with Tectonic + safety limits.
4. **Collab MVP:** Yjs sync via `y-websocket` + presence indicators.
5. **Persistence + autosave:** document save/versioning, recoverability, observability.