"""Django admin registration for the user model."""

from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for the custom user model."""

    ordering = ("username",)
    list_display = ("username", "is_admin", "is_active", "created_at")
    list_filter = ("is_admin", "is_active")
    search_fields = ("username",)
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Permissions", {"fields": ("is_admin", "is_active")}),
        ("Dates", {"fields": ("last_login", "created_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "password1", "password2", "is_admin"),
            },
        ),
    )
    readonly_fields = ("created_at",)
