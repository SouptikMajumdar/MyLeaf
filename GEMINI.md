# MyLeaf Project Guide

## Project Overview
MyLeaf is an open-source, collaborative LaTeX editor designed to be faster and smarter than existing solutions like Overleaf. It emphasizes ease of deployment and modern user experience.

## Key Documentation
- **[Requirements](./REQUIREMENTS.md):** Detailed breakdown of functional and non-functional goals.
- **[Architecture](./ARCHITECTURE.md):** Technical design, stack choices, and system diagrams.

## Quick Start (Development)

### Prerequisites
- Node.js 18+
- npm / yarn / pnpm

### Commands
1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run Development Server:**
    *(Standard Next.js App Router)*
    ```bash
    npm run dev
    ```
3.  **Build for Production:**
    ```bash
    npm run build
    ```

## Development Conventions
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Utility-first)
- **Linting:** ESLint (Prettier optional; not configured yet)

## Deployment (Docker)

MyLeaf runs as a single Docker container with pre-cached Tectonic for fast LaTeX compilation.

### Quick Deploy
```bash
docker-compose up -d
```

### Manual Build
```bash
docker build -t myleaf .
docker run -p 3000:3000 -p 1234:1234 -v myleaf-data:/app/data myleaf
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_COLLABORATION` | Enable y-websocket server | `true` |
| `NEXT_PUBLIC_SYNC_URL` | WebSocket URL for clients | `ws://localhost:1234` |
| `DATABASE_URL` | SQLite database path | `file:/app/data/myleaf.db` |
