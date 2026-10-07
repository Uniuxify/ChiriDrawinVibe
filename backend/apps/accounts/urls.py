"""URL routes for authentication."""

from __future__ import annotations

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import (
    LoginView,
    MeView,
    RegisterView,
    UserDetailView,
    UserListView,
)

urlpatterns = [
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/refresh", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/me", MeView.as_view(), name="auth-me"),
    path("users", UserListView.as_view(), name="users-list"),
    path("users/<int:user_id>", UserDetailView.as_view(), name="user-detail"),
]
