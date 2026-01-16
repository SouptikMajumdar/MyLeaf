# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyLeaf is a collaborative LaTeX editor (Overleaf alternative) built as a single-container monolith. It combines a Next.js web app, Yjs WebSocket sync service, and Tectonic LaTeX engine in one Docker container.

## Development Commands

```bash
# Install dependencies
npm install

# Start Next.js dev server (port 3000)
npm run dev

# Start collaboration server only (port 1234)
npm run dev:collab

# Start both servers together
npm run dev:all

# Build for production
npm run build

# Run production server
npm start

# Lint
npm run lint
```

## Architecture

### Runtime Processes (Production)
The container runs two processes:
1. **Next.js** on port 3002 - UI + API routes
2. **y-websocket** on port 1234 - Real-time collaboration sync

### Key Data Flows

**LaTeX Compilation** (`POST /api/compile`):
1. Frontend sends files array to compile endpoint
2. Backend writes files to isolated temp directory
3. Spawns `tectonic` with timeout/size limits
4. Returns PDF binary or compilation errors
5. Cleans up temp directory

**Real-time Collaboration**:
1. CodeMirror changes captured by `y-codemirror.next`
2. Yjs CRDT updates sent via WebSocket to y-websocket server
3. Server broadcasts to all connected clients
4. CRDTs handle conflict resolution automatically

**AI Features** (Math Helper, Citation Finder):
1. UI components in `src/components/ai/` trigger API calls
2. Routes in `src/app/api/ai/` use provider abstraction
3. `src/lib/ai/provider.ts` supports OpenAI, Anthropic, or Ollama
4. Prompts centralized in `src/lib/ai/prompts.ts`

### Source Structure

```
src/
├── app/
│   ├── page.tsx          # Main split-pane editor UI
│   └── api/
│       ├── compile/      # LaTeX compilation endpoint
│       ├── ai/           # AI feature endpoints (math, citations)
│       └── templates/    # Conference template API
├── components/
│   ├── CollaborativeEditor.tsx  # CodeMirror + Yjs integration
│   ├── FileExplorer.tsx         # File tree sidebar
│   └── ai/                      # AI feature panels
├── lib/
│   ├── ai/
│   │   ├── provider.ts   # Multi-provider AI abstraction
│   │   └── prompts.ts    # System prompts for AI features
│   └── templates/        # Conference template metadata
└── types/
    └── files.ts          # FileNode tree structure + helpers
```

### File System Model

The in-memory file system uses a tree of `FileNode` objects (`src/types/files.ts`):
- Each node has `id`, `name`, `type` (file/folder), `parentId`
- Files have `content`, folders have `children`
- Helper functions: `findNode`, `addNode`, `removeNode`, `updateFileContent`

### Environment Configuration

Copy `.env.example` to `.env.local` for local development. Key variables:
- `AI_PROVIDER` - "openai" | "anthropic" | "ollama"
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` - API keys for AI features
- `MYLEAF_COMPILE_TIMEOUT_MS` - Compilation timeout (default 20000ms)
- `NEXT_PUBLIC_SYNC_URL` - WebSocket URL for collaboration clients

### Compilation Security

The compile endpoint (`src/app/api/compile/route.ts`) implements:
- Input size limits (`MYLEAF_MAX_TEX_BYTES`)
- Output PDF size limits (`MYLEAF_MAX_PDF_BYTES`)
- Process timeout with SIGKILL
- Isolated temp directories with random names
- Path traversal prevention via `path.basename()`
- No shell escape

## Keyboard Shortcuts (UI)

- `Cmd+M` - Toggle Math Helper panel
- `Cmd+Shift+C` - Toggle Citation Finder panel
- `Cmd+B` - Toggle file explorer sidebar
