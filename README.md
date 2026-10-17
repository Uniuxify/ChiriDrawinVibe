# ChiriDrawin

**This app is vibe-coded**

Collaborative drawing web app. The shared canvas is split into cells distributed
between players. Players sequentially unlock and fill their own cells while seeing
a limited read-only context of neighbouring cells. The final picture is assembled
from all cells after the session finishes.

## Repository layout

```
backend/    Django + DRF REST API (see backend/README.md)
frontend/   React + TypeScript + Vite client (see frontend/README.md)
```

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py create_admin        # optional admin account
python manage.py runserver           # http://localhost:8000/api/v1/
```

Defaults: SQLite, local storage, eager Celery — no Docker required.

### Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:8000`.

## Quality checks

```bash
# Backend
cd backend && ruff check . && pytest && python manage.py check

# Frontend
cd frontend && npx tsc -b && npm run build
```

## Status

| Area | State |
| --- | --- |
| Backend: auth, sessions, cells, iterations, rendering | Implemented |
| Backend: migrations, lint (ruff), tests (pytest) | Passing |
| Frontend: scaffold, auth, session list/create/detail | Implemented |
| Frontend: canvas, cell editor, public gallery | Implemented |
| Frontend: production build (`npm run build`) | Passing |
| Real-time (WebSockets), image upload, timelapse player | Future (per plan) |