# ChiriDrawin

**This app is vibe-coded**


Collaborative drawing web app. The shared canvas is split into cells distributed
between players. Players sequentially unlock and fill their own cells while seeing
a limited read-only context of neighbouring cells. The final picture is assembled
from all cells.

This repository currently contains the **backend** (Django + DRF).

## Backend stack

- Django + Django REST Framework
- JWT auth (`djangorestframework-simplejwt`)
- SQLite by default; PostgreSQL via `DB_ENGINE=postgres`
- Celery (eager by default, no broker required locally) for iteration sweeps and
  raster rendering
- Local filesystem storage by default; MinIO/S3 via `STORAGE_BACKEND=s3`
- CairoSVG for `JSON -> SVG -> raster` rendering

### Django apps

| App | Responsibility |
| --- | --- |
| `apps.accounts` | Users, registration, login, JWT tokens |
| `apps.sessions` | Sessions, players, lifecycle, cell distribution |
| `apps.cells` | Cells, history, autosave/commit, context geometry |
| `apps.iterations` | Iterations, quotas, timers, progress |
| `apps.rendering` | SVG build, rasterization, storage |
| `apps.common` | Shared enums, permissions, errors, config endpoint |

## Setup

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py create_admin          # optional: creates a superuser/admin
python manage.py runserver
```

> **Python**: use a regular (non free-threaded) CPython 3.10+. The
> free-threaded build of 3.13 (`python3.13t`) cannot install `cffi`, which is
> required by `cairosvg`.

The API is served under `/api/v1/`. Public configuration is available at
`GET /api/v1/config`.

### Environment variables

Copy `.env` or set variables directly. Notable defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DJANGO_DEBUG` | `true` | Debug mode |
| `DB_ENGINE` | `sqlite` | `sqlite` or `postgres` |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `CELERY_TASK_ALWAYS_EAGER` | `true` | Run tasks inline (no broker) |
| `POLLING_INTERVAL_SECONDS` | `5` | Frontend polling interval |
| `MAX_OPS_PER_CELL` | `20000` | History operation limit |
| `MAX_HISTORY_JSON_BYTES` | `5000000` | History JSON size limit |

## Quality checks

```bash
cd backend
ruff check .
pytest
python manage.py check
```

## Testing

Tests live in `backend/tests/`:

- `test_context.py` — pure geometry of the read-only context zone
  (rectangle/circle, `min`/`max`/percent radius, grid-edge clipping).
- `test_sessions.py` — session start, cell distribution, lifecycle guards.
- `test_commit.py` — commit resilience when rendering fails, cell revision
  exposure in unlock/state payloads.
- `test_public_viewing.py` — anonymous viewing of public finished sessions
  (`state`, `result`, `timelapse`).
- `test_admin_actions.py` — administrator cell overrides (skip, force fill).
- `test_orphan_redistribution.py` — dealing the orphan pool out once all
  originally-assigned cells are filled.

Run with `pytest`. The suite uses an isolated test database via `pytest-django`.

## Project layout

```
backend/
  apps/
    accounts/     sessions/     cells/
    iterations/   rendering/    common/
  config/         # Django settings, urls, celery
  tests/          # pytest suite
  manage.py
  pytest.ini
  .ruff.toml
```