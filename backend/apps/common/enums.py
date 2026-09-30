"""Shared enumerations used across applications."""

from __future__ import annotations

from django.db import models


class SessionStatus(models.TextChoices):
    """Lifecycle states of a drawing session."""

    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    FINISHED = "finished", "Finished"
    DELETED = "deleted", "Deleted"


class ContextShape(models.TextChoices):
    """Geometry used to compute the read-only context around a cell."""

    RECTANGLE = "rectangle", "Rectangle"
    CIRCLE = "circle", "Circle"


class ContextRadiusMode(models.TextChoices):
    """Interpretation of the context radius percentage."""

    PERCENT = "percent", "Percent"
    MIN = "min", "Minimum"
    MAX = "max", "Maximum"


class DistributionStrategy(models.TextChoices):
    """Strategy used to assign cells to players at session start."""

    RANDOM = "random", "Random"
    MIN_ADJACENT = "min_adjacent", "Min adjacent"


class CellStatus(models.TextChoices):
    """Lifecycle states of a single cell."""

    EMPTY = "empty", "Empty"
    UNLOCKED = "unlocked", "Unlocked"
    FILLED = "filled", "Filled"
    ORPHAN = "orphan", "Orphan"


class IterationState(models.TextChoices):
    """Lifecycle states of a session iteration."""

    ACTIVE = "active", "Active"
    FINISHED = "finished", "Finished"
