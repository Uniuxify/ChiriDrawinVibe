"""Management command creating the initial administrator account."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

User = get_user_model()


class Command(BaseCommand):
    """Create or promote an administrative user."""

    help = "Create an administrator account (idempotent by username)."

    def add_arguments(self, parser) -> None:
        """Register command-line arguments.

        Args:
            parser: The argparse parser used by Django.
        """
        parser.add_argument("username", type=str, help="Administrator username.")
        parser.add_argument(
            "--password",
            type=str,
            default=None,
            help="Password. If omitted, an unusable password is set.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        """Create or update the administrator account.

        Args:
            *args: Unused positional arguments.
            **options: Parsed command options.

        Raises:
            CommandError: If the username is empty.
        """
        username: str = options["username"].strip()
        if not username:
            raise CommandError("Username must not be empty.")

        password: str | None = options["password"]
        user, created = User.objects.get_or_create(
            username=username, defaults={"is_admin": True}
        )
        user.is_admin = True
        user.is_active = True

        if password:
            user.set_password(password)
        elif created:
            user.set_unusable_password()

        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} administrator '{username}'."))
