from django.conf import settings


def index_application_resume(application_id: int, text: str) -> None:
    """Index resume text in LanceDB for future local semantic search."""
    if not text.strip():
        return

    try:
        import lancedb

        db = lancedb.connect(settings.LANCEDB_URI)
        table_name = "renostter_curriculos"
        vector = _cheap_vector(text)
        data = [{"application_id": application_id, "text": text[:4000], "vector": vector}]
        if table_name in db.table_names():
            db.open_table(table_name).add(data)
        else:
            db.create_table(table_name, data=data)
    except Exception:
        return


def _cheap_vector(text: str, size: int = 32) -> list[float]:
    buckets = [0.0] * size
    for index, char in enumerate(text.lower()[:8000]):
        buckets[index % size] += (ord(char) % 31) / 31
    norm = max(sum(abs(v) for v in buckets), 1.0)
    return [round(v / norm, 6) for v in buckets]
