"""Serializers for cell unlock, autosave, commit and context."""

from __future__ import annotations

from rest_framework import serializers

from apps.cells.models import Cell, CellRaster


class CellSerializer(serializers.ModelSerializer):
    """Redacted representation of a cell visible to a player."""

    has_raster = serializers.SerializerMethodField()

    class Meta:
        model = Cell
        fields = (
            "id",
            "row",
            "col",
            "status",
            "owner_id",
            "revision",
            "filled_at",
            "comment",
            "has_raster",
        )
        read_only_fields = fields

    def get_has_raster(self, obj: Cell) -> bool:
        """Return whether a rendered raster exists for the cell.

        Args:
            obj: The cell being serialized.

        Returns:
            True when at least one raster exists.
        """
        return obj.rasters.exists()


class RasterSerializer(serializers.ModelSerializer):
    """Representation of a stored raster artifact."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = CellRaster
        fields = ("id", "storage_key", "width", "height", "url")
        read_only_fields = fields

    def get_url(self, obj: CellRaster) -> str:
        """Return a client-usable URL for the raster.

        Args:
            obj: The raster being serialized.

        Returns:
            A URL resolved from the active storage backend.
        """
        from apps.rendering.storage import get_storage

        return get_storage().url(obj.storage_key)


class AutosaveSerializer(serializers.Serializer):
    """Validate autosave payloads."""

    operations = serializers.ListField(child=serializers.JSONField())
    revision = serializers.IntegerField(min_value=0)


class CommitSerializer(serializers.Serializer):
    """Validate final commit payloads."""

    operations = serializers.ListField(child=serializers.JSONField())
    revision = serializers.IntegerField(min_value=0)
    comment = serializers.CharField(required=False, allow_blank=True, default="")
