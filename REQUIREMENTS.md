# MyLeaf Requirements

## Project Goal
Create a high-performance, open-source alternative to Overleaf that is easily deployable, supports real-time collaboration, and integrates intelligent AI features.

## Core Features

### 1. Real-Time Collaboration
- Multiple users must be able to edit the same LaTeX document simultaneously.
- Changes should be synchronized instantly across all connected clients.
- Visual indicators (cursors) for other users' positions.

### 2. LaTeX Editing & Compilation
- Robust code editor with syntax highlighting for LaTeX.
- Server-side compilation of LaTeX source code into PDF.
- PDF Preview pane synchronized with the editor.
- Fast compilation times using efficient engines (e.g., Tectonic).

### 3. User Interface
- Modern, "IDE-like" experience.
- Split-screen layout: Editor (Left) | PDF Preview (Right).
- Resizable panels.
- Clean, minimal design using Tailwind CSS.

### 4. Intelligence (AI)
- AI-assisted writing (grammar checking, refinement).
- Context-aware LaTeX autocompletion.
- "Chat with your document" capability.

## Non-Functional Requirements

### 1. Deployability
- **Priority:** Must be trivial to deploy on any server (cloud or on-prem).
- **Docker:** A single Docker container should house the entire application (Frontend + Backend + Database + LaTeX Engine).
- **Configuration:** Minimal environment variables required for startup.

### 2. Performance
- Low-latency collaboration (WebSockets).
- Fast initial page loads (Next.js SSR).
- Responsive UI.

### 3. Architecture
- **Monolithic:** Single service to reduce deployment complexity.
- **Extensible:** easy to add new AI providers or compilation engines.

---

## AI Features Plan (Student-Focused)

### Feature 1: Math Expression Helper
- **What:** Plain English → LaTeX math code
- **Route:** `POST /api/ai/math` with `{ prompt: string }`
- **UI:** `MathHelperPanel` popover with text input + Generate button
- **Trigger:** `Cmd+M` shortcut or toolbar button

### Feature 2: Citation Finder
- **What:** Describe a claim → get relevant papers with BibTeX
- **Route:** `POST /api/ai/citations` with `{ query: string }`
- **Flow:** LLM generates search queries → Semantic Scholar/CrossRef API → LLM ranks results → return top 5 with BibTeX
- **UI:** `CitationFinderPanel` with search input and results list

### Feature 3: Academic Tone Checker
- **What:** Scan document for informal language, weak phrasing, inconsistencies
- **Route:** `POST /api/ai/tone-check` with `{ text: string }`
- **Returns:** `{ issues: Array<{ line, excerpt, problem, suggestion }> }`
- **UI:** `ToneIssuesList` sidebar + inline CodeMirror highlights
- **Offline fallback:** Basic regex rules for common issues

### Feature 4: Chat with Your Paper
- **What:** Q&A grounded in document + Reviewer simulation mode
- **Route:** `POST /api/ai/chat` with `{ messages, document, mode: "qa" | "reviewer" }`
- **UI:** `ChatPanel` drawer with message list, input, mode toggle
- **Persistence:** Chat history stored per project in SQLite

### Shared Infrastructure
- `src/lib/ai/provider.ts` — AI provider abstraction (OpenAI/Claude/Ollama)
- `src/lib/ai/prompts.ts` — Central prompt templates
- `src/components/ai/` — UI components for all AI features
- Env vars: `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`

### Implementation Order
1. **Phase A:** AI provider abstraction + Math Helper (foundation + quick win)
2. **Phase B:** Citation Finder (external API integration)
3. **Phase C:** Tone Checker (reuses provider infra)
4. **Phase D:** Chat with Paper (most complex; streaming, history)