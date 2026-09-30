"""Reusable DRF permission classes."""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Allow access only to users flagged as administrators."""

    message = "Administrator privileges are required."

    def has_permission(self, request, view) -> bool:
        """Return whether the requester is an authenticated admin.

        Args:
            request: The current HTTP request.
            view: The view being accessed.

        Returns:
            True when the user is authenticated and is an admin.
        """
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)
