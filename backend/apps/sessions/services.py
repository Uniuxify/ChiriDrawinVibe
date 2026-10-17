"""Domain services for session distribution and lifecycle."""

from __future__ import annotations

import random

from django.db import transaction
from django.utils import timezone

from apps.cells.models import Cell
from apps.common.enums import CellStatus, SessionStatus
from apps.common.errors import ConflictError, ValidationError
from apps.iterations.models import Iteration
from apps.sessions.distribution import build_assignment
from apps.sessions.models import GameSession


def distribute_cells(session: GameSession) -> None:
    """Assign every grid cell to a player using the configured strategy.

    The ``min_adjacent`` strategy colours the grid with one class per player
    so neighbours rarely share an owner (see
    :mod:`apps.sessions.distribution`), then maps classes to players randomly.
    The ``random`` strategy simply shuffles the cells.

    Args:
        session: The session being started.

    Raises:
        ValidationError: If there are no active players to distribute to.
    """
    players = list(session.players.filter(is_active=True).order_by("joined_at"))
    if not players:
        raise ValidationError("A session needs at least one active player to start.")

    if session.distribution_strategy == "min_adjacent":
        _distribute_coloured(session, players)
        return

    positions = [
        (row, col)
        for row in range(session.grid_rows)
        for col in range(session.grid_cols)
    ]
    random.shuffle(positions)

    for index, (row, col) in enumerate(positions):
        player = players[index % len(players)]
        Cell.objects.create(
            session=session,
            row=row,
            col=col,
            owner=player.user,
            original_owner=player.user,
            status=CellStatus.EMPTY,
        )


def _distribute_coloured(session: GameSession, players: list) -> None:
    """Create cells coloured so neighbouring cells rarely share an owner.

    Args:
        session: The session being started.
        players: The active players, in join order.
    """
    grid = build_assignment(session.grid_rows, session.grid_cols, len(players))

    # Map classes to players randomly so the same colours do not always go to
    # the same people across sessions.
    order = list(players)
    random.shuffle(order)

    for row in range(session.grid_rows):
        for col in range(session.grid_cols):
            player = order[grid[row][col]]
            Cell.objects.create(
                session=session,
                row=row,
                col=col,
                owner=player.user,
                original_owner=player.user,
                status=CellStatus.EMPTY,
            )


@transaction.atomic
def start_session(session: GameSession) -> GameSession:
    """Start a draft session, distributing cells and creating iteration 0.

    The session may be started before it is full (an early start); the client
    is responsible for warning the owner. The only rejected player counts are
    an empty session and an accidental overflow past the configured maximum.

    Args:
        session: The session to start.

    Returns:
        The updated session instance.

    Raises:
        ConflictError: If the session is not in draft state or cells exist.
        ValidationError: If there are no players or more players than allowed.
    """
    locked = GameSession.objects.select_for_update().get(pk=session.pk)
    if locked.status != SessionStatus.DRAFT:
        raise ConflictError("Only draft sessions can be started.")

    joined = locked.players.filter(is_active=True).count()
    if joined > locked.players_count:
        raise ValidationError(
            f"The session has more players than allowed: "
            f"{joined} of {locked.players_count}.",
            details={"joined": joined, "max_players": locked.players_count},
        )
    if joined == 0:
        raise ValidationError(
            f"Not enough players joined: 0 of {locked.players_count} required.",
            details={"joined": joined, "required": locked.players_count},
        )

    if locked.cells.exists():
        raise ConflictError("Cells have already been distributed for this session.")

    distribute_cells(locked)

    locked.status = SessionStatus.ACTIVE
    locked.started_at = timezone.now()
    locked.touch()
    locked.save()

    iteration = Iteration.objects.create(session=locked, index=0)
    _seed_progress(iteration, locked)
    return locked


def _seed_progress(iteration: Iteration, session: GameSession) -> None:
    """Create progress rows for every active player of an iteration.

    Args:
        iteration: The iteration to seed.
        session: The owning session.
    """
    from apps.iterations.models import IterationProgress

    rows = [
        IterationProgress(iteration=iteration, user=player.user)
        for player in session.players.filter(is_active=True)
    ]
    IterationProgress.objects.bulk_create(rows)


@transaction.atomic
def finish_session(session: GameSession) -> GameSession:
    """Finish a session early or because all cells are committed.

    Args:
        session: The session to finish.

    Returns:
        The updated session instance.

    Raises:
        ConflictError: If the session is already finished.
    """
    locked = GameSession.objects.select_for_update().get(pk=session.pk)
    if locked.status == SessionStatus.FINISHED:
        raise ConflictError("The session is already finished.")

    locked.status = SessionStatus.FINISHED
    locked.finished_at = timezone.now()
    locked.touch()
    locked.save()
    return locked


def maybe_finish_session(session: GameSession) -> bool:
    """Finish the session when all cells are committed.

    Args:
        session: The session to inspect.

    Returns:
        True when the session was transitioned to finished.
    """
    if session.cells.exclude(status=CellStatus.FILLED).exists():
        return False
    finish_session(session)
    return True


@transaction.atomic
def redistribute_orphan_cells(session: GameSession) -> int:
    """Deal the orphan pool out to the remaining active players.

    Orphan cells appear when a player leaves an active session; per the
    specification they are not reassigned right away. Once every cell that
    was originally assigned to a player is filled, the pool is shared out
    evenly (random order, balanced by current load) so the remaining
    players finish the picture.

    Args:
        session: The session to redistribute in.

    Returns:
        The number of cells that received a new owner.
    """
    unfinished_native = session.cells.filter(is_orphan=False).exclude(
        status=CellStatus.FILLED
    )
    if unfinished_native.exists():
        return 0

    orphans = list(
        session.cells.filter(
            is_orphan=True, status=CellStatus.ORPHAN
        ).order_by("row", "col")
    )
    if not orphans:
        return 0

    players = list(session.players.filter(is_active=True))
    if not players:
        return 0

    counts = {player.user_id: 0 for player in players}
    random.shuffle(orphans)
    for cell in orphans:
        target = min(players, key=lambda p: counts[p.user_id])
        counts[target.user_id] += 1
        cell.owner = target.user
        cell.is_orphan = False
        cell.status = CellStatus.EMPTY
        cell.save(update_fields=["owner", "is_orphan", "status"])

    session.touch()
    session.save(update_fields=["version"])
    return len(orphans)
