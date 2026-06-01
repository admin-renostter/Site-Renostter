from pathlib import Path


def extract_resume_text(path: str) -> str:
    """Extract resume text with Docling in best-effort mode."""
    try:
        from docling.document_converter import DocumentConverter

        result = DocumentConverter().convert(Path(path))
        document = result.document
        if hasattr(document, "export_to_markdown"):
            return document.export_to_markdown()
        return str(document)
    except Exception as exc:  # noqa: BLE001
        return f"[docling_unavailable] {exc}"
