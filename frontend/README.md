# ChiriDrawin frontend

React 18 + TypeScript + Vite client for ChiriDrawin.

## Stack

- **React 18 + TypeScript (strict)**, Vite dev server with `/api` proxy.
- **MUI v6** for UI components and theming.
- **TanStack Query** for REST requests and polling (interval from `GET /config`,
  default 5 s).
- **Zustand** for the JWT session and editor state.
- **Konva / react-konva** for the session grid and drawing surface.
- **react-router-dom** for routing.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api -> localhost:8000)
npm run build      # typecheck + production bundle
```

The backend must be running (`python manage.py runserver` in `../backend`).

## Structure

```
src/
  api/            # axios client (JWT refresh), typed DTOs, endpoint calls
  store/          # Zustand auth store
  features/
    auth/         # login / register screens
    sessions/     # list, create, join dialog, detail (polling + admin panel)
    canvas/       # SessionCanvas grid with cell states
    editor/       # CellEditor: tools, undo/redo, autosave, commit
    viewer/       # public finished-session gallery
  App.tsx         # routes + auth guard
  main.tsx        # providers (Query, Theme, Router)
```

## Behaviour notes

- **Auth**: access + refresh tokens in the Zustand store; a 401 triggers a single
  refresh retry, then a logout.
- **Session detail**: polls `GET /sessions/{id}/state` every 5 s; shows progress,
  available unlocks, next unlock time and admin controls.
- **Canvas**: foreign unfinished cells are black, own empty cells grey, filled
  cells white; hover shows a blue border on own cells; finished sessions start
  dark and reveal cell-by-cell on click.
- **Editor**: brush/eraser, palette, size, undo/redo (Ctrl+Z / Ctrl+Y, client
  only), periodic autosave, and an irreversible commit dialog with an optional
  comment.

## Checks

```bash
npx tsc -b        # typecheck (no output = clean)
npm run build     # typecheck + bundle
```
