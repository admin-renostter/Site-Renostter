from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

import requests
from django.conf import settings

from .storage import StorageNotConfigured, _auth_headers, _supabase_url


@dataclass(frozen=True)
class StorageUsage:
    provider: str
    used_bytes: int
    total_bytes: int

    @property
    def percent_used(self) -> float | None:
        if self.total_bytes <= 0:
            return None
        return round((self.used_bytes / self.total_bytes) * 100, 2)

    @property
    def has_quota(self) -> bool:
        return self.total_bytes > 0


def get_render_storage_usage() -> StorageUsage:
    root = Path(settings.PRIVATE_MEDIA_ROOT)
    configured_total = int(getattr(settings, "RENDER_STORAGE_LIMIT_BYTES", 0) or 0)

    if configured_total > 0:
        return StorageUsage(
            provider="render",
            used_bytes=_directory_size(root),
            total_bytes=configured_total,
        )

    disk_usage = shutil.disk_usage(root)
    return StorageUsage(
        provider="render",
        used_bytes=disk_usage.used,
        total_bytes=disk_usage.total,
    )


def get_supabase_storage_usage() -> StorageUsage:
    total_bytes = int(getattr(settings, "SUPABASE_STORAGE_LIMIT_BYTES", 0) or 0)
    used_bytes = _sum_supabase_bucket_prefix("")
    return StorageUsage(
        provider="supabase",
        used_bytes=used_bytes,
        total_bytes=total_bytes,
    )


def _directory_size(root: Path) -> int:
    if not root.exists():
        return 0
    total = 0
    for item in root.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def _sum_supabase_bucket_prefix(prefix: str) -> int:
    bucket = settings.SUPABASE_STORAGE_BUCKET.strip("/")
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY or not bucket:
        raise StorageNotConfigured("Supabase Storage nao configurado.")

    total = 0
    offset = 0
    limit = 100
    while True:
        response = requests.post(
            f"{_supabase_url()}/storage/v1/object/list/{bucket}",
            headers={**_auth_headers(), "Content-Type": "application/json"},
            json={
                "prefix": prefix,
                "limit": limit,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            },
            timeout=30,
        )
        response.raise_for_status()
        entries = response.json() or []
        if not entries:
            break

        for entry in entries:
            name = entry.get("name") or ""
            if not name:
                continue
            metadata = entry.get("metadata") or {}
            size = metadata.get("size")
            if size is not None:
                total += int(size)
            else:
                child_prefix = f"{prefix.rstrip('/')}/{name}".strip("/")
                total += _sum_supabase_bucket_prefix(child_prefix)

        if len(entries) < limit:
            break
        offset += limit

    return total
