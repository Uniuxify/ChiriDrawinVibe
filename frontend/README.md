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
    viewer/       # public gallery, anonymous viewer page, timelapse player
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
- **Anonymous viewer**: the public gallery links to `/public/:id`, where a
  finished public session is revealed cell by cell (plus an Open All
  cascade) and can be replayed in the timelapse player.
- **Timelapse**: the finished-session screen and the public viewer open a
  replay dialog (play/pause, scrubbing, speed) built from the committed
  histories of every cell.
- **Admin cell overrides**: in admin mode, clicking a cell opens skip /
  fill-in-blank / release-lock actions.

## Debug tools

A lightweight in-app debugger makes it easier to trace the context/render flow:

- A floating 🐞 button (lower-right) opens the **Debug log** panel, showing API
  calls, context payloads, neighbour histories and session/editor events.
- Logging is **on by default on `localhost`**. Toggle it with the switch in the
  panel, or force it with `localStorage.setItem("chiridrawin:debug", "1")` /
  `window.__CHIRI_DEBUG__ = true` before the app boots.
- In code, use the namespaced helper from `src/shared/debug.ts`:
  `const log = debug("myFeature"); log.log("message", data)`.
- Namespaces in use: `api` (every request/response/error), `cells`
  (unlock/autosave/commit/context/history), `editor` (context + neighbour
  history flow) and `session` (cell selection/unlock decisions).

## Checks

```bash
npx tsc -b        # typecheck (no output = clean)
npm run build     # typecheck + bundle
```
