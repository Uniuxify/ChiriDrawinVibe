"""Django settings for the ChiriDrawin project.

The settings default to a fully local, dependency-free setup (SQLite, local
media storage, eager Celery) so the application can be run and tested without
Docker. Each of these can be overridden with environment variables to switch to
PostgreSQL, Redis and MinIO as described in the project plan.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool) -> bool:
    """Return a boolean environment variable.

    Args:
        name: Environment variable name.
        default: Value used when the variable is unset.

    Returns:
        Parsed boolean value.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    """Return an integer environment variable.

    Args:
        name: Environment variable name.
        default: Value used when the variable is unset.

    Returns:
        Parsed integer value.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def env_list(name: str, default: list[str]) -> list[str]:
    """Return a comma-separated list environment variable.

    Args:
        name: Environment variable name.
        default: Value used when the variable is unset.

    Returns:
        Parsed list of strings.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-secret-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "testserver"]
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "apps.accounts",
    "apps.sessions",
    "apps.cells",
    "apps.iterations",
    "apps.rendering",
    "apps.common",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database: SQLite by default, PostgreSQL when DB_ENGINE=postgres.
if os.getenv("DB_ENGINE", "sqlite").lower() == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "chiridrawin"),
            "USER": os.getenv("DB_USER", "chiridrawin"),
            "PASSWORD": os.getenv("DB_PASSWORD", "chiridrawin"),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation"
            ".UserAttributeSimilarityValidator"
        )
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS for the Vite dev server.
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    ["http://localhost:5173", "http://127.0.0.1:5173"],
)
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "EXCEPTION_HANDLER": "apps.common.errors.api_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_MINUTES", 30)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("JWT_REFRESH_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Application-specific public configuration.
POLLING_INTERVAL_SECONDS = env_int("POLLING_INTERVAL_SECONDS", 5)
AUTOSAVE_INTERVAL_SECONDS = env_int("AUTOSAVE_INTERVAL_SECONDS", 10)
RENDERER = os.getenv("RENDERER", "cairosvg")

MIN_CANVAS_SIZE = env_int("MIN_CANVAS_SIZE", 100)
MAX_CANVAS_SIZE = env_int("MAX_CANVAS_SIZE", 10000)
MIN_GRID = env_int("MIN_GRID", 2)
MAX_GRID = env_int("MAX_GRID", 100)
MAX_OPS_PER_CELL = env_int("MAX_OPS_PER_CELL", 20000)
MAX_HISTORY_JSON_BYTES = env_int("MAX_HISTORY_JSON_BYTES", 5_000_000)
MIN_INTERVAL_SECONDS = env_int("MIN_INTERVAL_SECONDS", 0)
#: Upper bound on players per session; keeps grid colouring search cheap.
MAX_PLAYERS = env_int("MAX_PLAYERS", 10)

# Celery. Defaults to eager execution so no broker is required locally.
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", True)
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BEAT_SCHEDULE = {
    "finalize-expired-iterations": {
        "task": "apps.iterations.tasks.finalize_expired_iterations",
        "schedule": env_int("ITERATION_SWEEP_SECONDS", 30),
    },
}

# Object storage. Local filesystem by default; MinIO/S3 when STORAGE_BACKEND=s3.
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "chiridrawin")
MINIO_USE_SSL = env_bool("MINIO_USE_SSL", False)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
