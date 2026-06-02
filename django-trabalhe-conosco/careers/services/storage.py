from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import requests
from django.conf import settings


class StorageNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredFile:
    key: str
    public_url: str = ""


@dataclass(frozen=True)
class DownloadedFile:
    content: bytes
    content_type: str


def is_supabase_storage_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY and settings.SUPABASE_STORAGE_BUCKET)


def ensure_private_resume_bucket() -> str:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")

    bucket = settings.SUPABASE_STORAGE_BUCKET.strip("/")
    response = requests.get(_storage_bucket_url(bucket), headers=_auth_headers(), timeout=15)
    if response.status_code == 200:
        data = response.json()
        if data.get("public") is True:
            raise RuntimeError(f"Bucket '{bucket}' existe, mas esta publico. Altere para privado no Supabase.")
        return "exists"
    if response.status_code != 404:
        response.raise_for_status()

    create_response = requests.post(
        _storage_bucket_collection_url(),
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json={
            "id": bucket,
            "name": bucket,
            "public": False,
            "file_size_limit": 5242880,
            "allowed_mime_types": [
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
        },
        timeout=15,
    )
    create_response.raise_for_status()
    return "created"


def upload_bytes_to_supabase(storage_key: str, content: bytes, content_type: str = "application/octet-stream") -> StoredFile:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")
    if not storage_key:
        raise ValueError("Chave do arquivo ausente.")

    response = requests.post(
        _storage_object_url(storage_key),
        headers={**_auth_headers(), "Content-Type": content_type, "x-upsert": "true"},
        data=content,
        timeout=30,
    )
    response.raise_for_status()
    return StoredFile(key=storage_key)


def upload_resume_to_supabase(application) -> StoredFile:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")

    if not application.resume:
        raise ValueError("Candidatura sem curriculo.")

    key = application.resume.name
    url = _storage_object_url(key)
    headers = {
        **_auth_headers(),
        "Content-Type": _content_type_for(application.resume.name),
        "x-upsert": "true",
    }

    with application.resume.open("rb") as resume_file:
        response = requests.post(url, headers=headers, data=resume_file, timeout=30)

    response.raise_for_status()
    return StoredFile(key=key)


def download_resume_from_supabase(storage_key: str) -> DownloadedFile:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")
    if not storage_key:
        raise ValueError("Chave do curriculo ausente.")

    response = requests.get(_storage_object_url(storage_key), headers=_auth_headers(), timeout=30)
    response.raise_for_status()
    return DownloadedFile(
        content=response.content,
        content_type=response.headers.get("Content-Type") or _content_type_for(storage_key),
    )


def delete_resume_from_supabase(storage_key: str) -> None:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")
    if not storage_key:
        raise ValueError("Chave do arquivo ausente.")

    response = requests.delete(_storage_object_url(storage_key), headers=_auth_headers(), timeout=15)
    if response.status_code not in {200, 204, 404}:
        response.raise_for_status()


def create_signed_resume_url(storage_key: str) -> str:
    if not is_supabase_storage_configured():
        raise StorageNotConfigured("Supabase Storage nao configurado.")
    if not storage_key:
        raise ValueError("Chave do curriculo ausente.")

    url = _storage_signed_url(storage_key)
    response = requests.post(
        url,
        headers={**_auth_headers(), "Content-Type": "application/json"},
        json={"expiresIn": settings.SUPABASE_SIGNED_URL_TTL_SECONDS},
        timeout=15,
    )
    response.raise_for_status()
    response_data = response.json()
    signed_url = response_data.get("signedURL") or response_data.get("signedUrl") or response_data.get("url") or ""
    if not signed_url:
        raise ValueError("Supabase nao retornou URL assinada para o curriculo.")
    if signed_url.startswith("http"):
        return signed_url
    return f"{_supabase_url()}{signed_url}"


def _storage_object_url(storage_key: str) -> str:
    bucket = settings.SUPABASE_STORAGE_BUCKET.strip("/")
    key = _quote_storage_key(storage_key)
    return f"{_supabase_url()}/storage/v1/object/{bucket}/{key}"


def _storage_signed_url(storage_key: str) -> str:
    bucket = settings.SUPABASE_STORAGE_BUCKET.strip("/")
    key = _quote_storage_key(storage_key)
    return f"{_supabase_url()}/storage/v1/object/sign/{bucket}/{key}"


def _storage_bucket_collection_url() -> str:
    return f"{_supabase_url()}/storage/v1/bucket"


def _storage_bucket_url(bucket: str) -> str:
    return f"{_storage_bucket_collection_url()}/{quote(bucket, safe='')}"


def _supabase_url() -> str:
    url = settings.SUPABASE_URL.rstrip("/")
    for suffix in ("/rest/v1", "/rest/v1/"):
        if url.endswith(suffix.rstrip("/")):
            return url[: -len(suffix.rstrip("/"))].rstrip("/")
    return url


def _quote_storage_key(storage_key: str) -> str:
    return quote(storage_key.lstrip("/"), safe="/")


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }


def _content_type_for(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".doc":
        return "application/msword"
    if suffix == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return "application/octet-stream"
