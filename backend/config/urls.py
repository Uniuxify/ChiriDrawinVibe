"""Root URL configuration for the ChiriDrawin project."""

from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.sessions.urls")),
    path("api/v1/", include("apps.cells.urls")),
    path("api/v1/", include("apps.iterations.urls")),
    path("api/v1/", include("apps.rendering.urls")),
    path("api/v1/", include("apps.common.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
