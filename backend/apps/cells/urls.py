"""URL routes for cell operations."""

from __future__ import annotations

from django.urls import path

from apps.cells.views import (
    CellAdminUnlockView,
    CellAutosaveView,
    CellCommitView,
    CellContextView,
    CellLockView,
    CellUnlockView,
)

urlpatterns = [
    path("cells/<uuid:cell_id>/unlock", CellUnlockView.as_view(), name="cell-unlock"),
    path("cells/<uuid:cell_id>/lock", CellLockView.as_view(), name="cell-lock"),
    path(
        "cells/<uuid:cell_id>/autosave",
        CellAutosaveView.as_view(),
        name="cell-autosave",
    ),
    path("cells/<uuid:cell_id>/commit", CellCommitView.as_view(), name="cell-commit"),
    path(
        "cells/<uuid:cell_id>/context",
        CellContextView.as_view(),
        name="cell-context",
    ),
    path(
        "cells/<uuid:cell_id>/admin/unlock",
        CellAdminUnlockView.as_view(),
        name="cell-admin-unlock",
    ),
]
