from django.conf import settings
from sqlalchemy import JSON, DateTime, Integer, MetaData, String, Table, Column, create_engine, func, insert

metadata = MetaData()

audit_events = Table(
    "audit_events",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("event", String(120), nullable=False),
    Column("payload", JSON, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)


def audit_event(event: str, payload: dict) -> None:
    try:
        engine = create_engine(settings.SQLALCHEMY_AUDIT_URL, pool_pre_ping=True)
        metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(insert(audit_events).values(event=event, payload=payload))
    except Exception:
        return
