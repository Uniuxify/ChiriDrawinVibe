"""Backend-agnostic object storage for rendered artifacts.

Two backends are supported:

* ``local`` stores files under ``MEDIA_ROOT`` and is the default so the project
  runs without external services.
* ``s3`` stores files in a MinIO/S3 bucket and is activated with
  ``STORAGE_BACKEND=s3``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol

from django.conf import settings

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    """Interface implemented by object storage backends."""

    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str:
        """Store ``data`` under ``key`` and return the persisted key.

        Args:
            key: Relative object key.
            data: Raw bytes to persist.
            content_type: MIME type of the payload.

        Returns:
            The storage key that can later be used to read the object.
        """

    def url(self, key: str) -> str:
        """Return a client-usable URL for the stored object.

        Args:
            key: Previously stored object key.

        Returns:
            An absolute or media-relative URL.
        """


class LocalStorage:
    """Store artifacts on the local filesystem under ``MEDIA_ROOT``."""

    def __init__(self, root: Path) -> None:
        """Initialize the backend.

        Args:
            root: Directory that acts as the storage root.
        """
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str:
        """Write bytes to disk.

        Args:
            key: Relative object key.
            data: Raw bytes to persist.
            content_type: Unused for the local backend.

        Returns:
            The storage key.
        """
        target = self.root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return key

    def url(self, key: str) -> str:
        """Return a media URL for the object.

        Args:
            key: Stored object key.

        Returns:
            A URL rooted at ``MEDIA_URL``.
        """
        return f"{settings.MEDIA_URL}{key}"


class S3Storage:
    """Store artifacts in a MinIO/S3 bucket via boto3."""

    def __init__(self) -> None:
        """Initialize the S3 client lazily."""
        import boto3  # imported lazily to keep boto3 optional

        self.bucket = settings.MINIO_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.MINIO_ENDPOINT,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            use_ssl=settings.MINIO_USE_SSL,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        """Create the target bucket when it does not exist yet."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, data: bytes, content_type: str = "image/png") -> str:
        """Upload bytes to S3.

        Args:
            key: Relative object key.
            data: Raw bytes to persist.
            content_type: MIME type of the payload.

        Returns:
            The storage key.
        """
        self.client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
        )
        return key

    def url(self, key: str) -> str:
        """Return a public URL for the object.

        Args:
            key: Stored object key.

        Returns:
            A URL pointing at the MinIO/S3 endpoint.
        """
        return f"{settings.MINIO_ENDPOINT}/{self.bucket}/{key}"


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Return the configured storage backend singleton.

    Returns:
        Either a :class:`LocalStorage` or :class:`S3Storage` instance.
    """
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND.lower() == "s3":
            try:
                _storage = S3Storage()
            except Exception:
                logger.exception("S3 storage unavailable, falling back to local")
                _storage = LocalStorage(Path(settings.MEDIA_ROOT))
        else:
            _storage = LocalStorage(Path(settings.MEDIA_ROOT))
    return _storage
