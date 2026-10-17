"""Iteration lifecycle: timers, quotas and progression."""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.cells.models import Cell
from apps.common.enums import CellStatus, IterationState, SessionStatus
from apps.common.errors import ConflictError
from apps.iterations.models import Iteration, IterationProgress
from apps.sessions.models import GameSession

logger = logging.getLogger(__name__)


@transaction.atomic
def on_cell_committed(cell: Cell) -> None:
    """Apply all side effects that follow a successful cell commit.

    Responsibilities:

    * enqueue rendering of the committed cell;
    * mark the player's progress as exhausted when the quota is spent;
    * start the iteration timer when the first player exhausts the quota;
    * advance to the next iteration when every player is done;
    * finish the session when all cells are committed.

    Args:
        cell: The committed cell.
    """
    session = cell.session

    from apps.rendering.tasks import render_cell_task

    dispatch_render(render_cell_task, str(cell.id), "cell")

    iteration = session.iterations.filter(state=IterationState.ACTIVE).first()
    if iteration is not None:
        progress = IterationProgress.objects.filter(
            iteration=iteration, user=cell.owner
        ).first()
        if progress and progress.filled_count >= session.unlock_quota:
            if progress.exhausted_at is None:
                progress.exhausted_at = timezone.now()
                progress.save(update_fields=["exhausted_at"])
            _maybe_start_timer(iteration, session)
        _maybe_advance_iteration(iteration, session)

    # Once every originally-assigned cell is filled, the orphan pool of a
    # departed player is dealt out to the remaining players; the session can
    # then finish once those cells are filled too.
    from apps.sessions.services import redistribute_orphan_cells

    redistribute_orphan_cells(session)

    _maybe_finish_session(session)


def _maybe_start_timer(iteration: Iteration, session: GameSession) -> None:
    """Start the iteration timer when the first player exhausts the quota.

    The timer deliberately does not start until one player is completely done,
    matching the specification that a session may wait indefinitely for slow
    players.

    Args:
        iteration: The current iteration.
        session: The owning session.
    """
    if iteration.timer_started_at is not None:
        return
    if session.interval_seconds <= 0:
        # A zero interval means there is no time pressure at all: the
        # iteration advances only once every player has spent their quota, so
        # no timer (and therefore no auto-commit) is ever started.
        return
    iteration.timer_started_at = timezone.now()
    iteration.ends_at = iteration.timer_started_at + timedelta(
        seconds=session.interval_seconds
    )
    iteration.save(update_fields=["timer_started_at", "ends_at"])


def _maybe_advance_iteration(iteration: Iteration, session: GameSession) -> None:
    """Finish the iteration and open the next one when everyone is done.

    Args:
        iteration: The current iteration.
        session: The owning session.
    """
    active_players = session.players.filter(is_active=True).values_list(
        "user_id", flat=True
    )
    exhausted = iteration.progress.filter(
        exhausted_at__isnull=False
    ).values_list("user_id", flat=True)

    if set(active_players) - set(exhausted):
        return

    _finish_iteration(iteration)
    _open_next_iteration(session, iteration.index + 1)


def _finish_iteration(iteration: Iteration) -> None:
    """Mark an iteration as finished.

    Args:
        iteration: The iteration to finish.
    """
    iteration.state = IterationState.FINISHED
    iteration.finished_at = timezone.now()
    iteration.save(update_fields=["state", "finished_at"])


def _open_next_iteration(session: GameSession, index: int) -> None:
    """Create the next iteration and seed per-player progress.

    Args:
        session: The owning session.
        index: Ordinal of the new iteration.
    """
    if not session.cells.exclude(status=CellStatus.FILLED).exists():
        return

    new_iteration = Iteration.objects.create(session=session, index=index)
    rows = [
        IterationProgress(iteration=new_iteration, user=player.user)
        for player in session.players.filter(is_active=True)
    ]
    IterationProgress.objects.bulk_create(rows)
    session.touch()
    session.save(update_fields=["version"])


def _maybe_finish_session(session: GameSession) -> None:
    """Finish the session when no unfinished cells remain.

    Args:
        session: The session to inspect.
    """
    from apps.rendering.tasks import render_session_task
    from apps.sessions.services import finish_session

    if session.cells.exclude(status=CellStatus.FILLED).exists():
        return
    if session.status == SessionStatus.FINISHED:
        return

    finish_session(session)
    dispatch_render(render_session_task, session.id, "session")


def dispatch_render(task, target: int | str, label: str) -> None:
    """Enqueue a render task without letting failures break the request.

    Rendering is a side effect of a commit or of a session finish; a broken
    rasterizer must never turn a successful API call into a 500 response.

    Args:
        task: The Celery task to enqueue.
        target: Cell id or session id passed to the task.
        label: Human readable subject used in the log message.
    """
    try:
        task.delay(target)
    except Exception:
        logger.exception(
            "Rendering of %s %s failed; the API request is unaffected",
            label,
            target,
        )


@transaction.atomic
def force_commit_pending(session: GameSession) -> list[str]:
    """Auto-commit unlocked cells whose timer expired and drawing started.

    Called by the periodic sweeper. Cells that are unlocked but never drawn on
    are left untouched so the session waits for the player indefinitely.

    Args:
        session: The session to sweep.

    Returns:
        The list of cell ids that were auto-committed.
    """
    from apps.cells.services import commit_cell

    iteration = session.iterations.filter(state=IterationState.ACTIVE).first()
    if iteration is None or iteration.ends_at is None:
        return []
    if timezone.now() < iteration.ends_at:
        return []

    committed: list[str] = []
    pending = session.cells.filter(
        status=CellStatus.UNLOCKED, first_drawn_at__isnull=False
    )
    for cell in pending:
        latest = cell.histories.order_by("-revision").first()
        operations = latest.operations if latest else []
        try:
            commit_cell(
                cell.id,
                cell.locked_by,
                operations,
                cell.revision,
                cell.comment,
            )
        except ConflictError:
            logger.warning("Auto-commit skipped for cell %s", cell.id)
            continue
        committed.append(str(cell.id))
    return committed
