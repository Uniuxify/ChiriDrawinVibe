"""User model for ChiriDrawin.

Uses a custom user model from the start because the project identifies users by
``username`` only (no email) and needs an explicit ``is_admin`` role flag.
"""

from __future__ import annotations

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models


class UserManager(BaseUserManager):
    """Manager for the custom user model."""

    use_in_migrations = True

    def _create_user(
        self, username: str, password: str | None, **extra_fields
    ) -> User:
        """Create and persist a user with a hashed password.

        Args:
            username: Unique login name.
            password: Raw password; hashed before storage.
            **extra_fields: Additional model fields.

        Returns:
            The created user instance.

        Raises:
            ValueError: If the username is empty.
        """
        if not username:
            raise ValueError("The username must be set.")
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(
        self, username: str, password: str | None = None, **extra_fields
    ) -> User:
        """Create a regular (non-admin) user.

        Args:
            username: Unique login name.
            password: Raw password.
            **extra_fields: Additional model fields.

        Returns:
            The created user instance.
        """
        extra_fields.setdefault("is_admin", False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(
        self, username: str, password: str | None = None, **extra_fields
    ) -> User:
        """Create an administrative user.

        Args:
            username: Unique login name.
            password: Raw password.
            **extra_fields: Additional model fields.

        Returns:
            The created user instance.
        """
        extra_fields.setdefault("is_admin", True)
        return self._create_user(username, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """A registered participant of the system.

    Attributes:
        username: Unique login name.
        is_admin: Whether the user can manage sessions.
        is_active: Whether the account may authenticate.
        created_at: Creation timestamp.
    """

    username = models.CharField(max_length=150, unique=True)
    is_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "accounts_user"
        ordering = ("username",)

    def __str__(self) -> str:
        """Return the username for admin displays."""
        return self.username

    @property
    def is_staff(self) -> bool:
        """Return whether the user may access the Django admin site."""
        return self.is_admin

    def has_perm(self, perm: str, obj: object | None = None) -> bool:
        """Return whether the user holds a permission.

        Args:
            perm: Permission string.
            obj: Optional object the permission is checked against.

        Returns:
            True for active superusers, otherwise the default behaviour.
        """
        if self.is_active and self.is_admin:
            return True
        return super().has_perm(perm, obj)

    def has_module_perms(self, app_label: str) -> bool:
        """Return whether the user may view an app in the Django admin.

        Args:
            app_label: Django application label.

        Returns:
            True for active admins.
        """
        return bool(self.is_active and self.is_admin)
