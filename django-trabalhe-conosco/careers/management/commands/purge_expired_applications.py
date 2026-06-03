from __future__ import annotations

from datetime import timedelta
from hashlib import sha256

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from careers.models import Application
from careers.services.audit import audit_event
from careers.services.storage import StorageNotConfigured, delete_resume_from_supabase


class Command(BaseCommand):
    help = "Anonimiza candidaturas expiradas e remove curriculos conforme retencao LGPD."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30, help="Dias corridos de retencao. Padrao: 30.")
        parser.add_argument("--dry-run", action="store_true", help="Lista o que seria removido sem alterar dados.")
        parser.add_argument("--limit", type=int, default=500, help="Limite maximo de candidaturas por execucao.")

    def handle(self, *args, **options):
        days = max(options["days"], 1)
        dry_run = options["dry_run"]
        limit = max(options["limit"], 1)
        now = timezone.now()
        cutoff = now - timedelta(days=days)

        queryset = (
            Application.objects.select_related("job")
            .filter(deleted_at__isnull=True)
            .filter(Q(retention_until__lte=now) | Q(retention_until__isnull=True, created_at__lte=cutoff))
            .order_by("created_at")[:limit]
        )
        applications = list(queryset)

        if not applications:
            self.stdout.write(self.style.SUCCESS("Nenhuma candidatura expirada encontrada."))
            return

        self.stdout.write(f"{len(applications)} candidatura(s) expirada(s) encontrada(s).")
        removed = 0
        errors = 0
        for application in applications:
            retention_label = application.retention_until.strftime("%Y-%m-%d") if application.retention_until else "sem prazo"
            self.stdout.write(
                f"- #{application.pk} | vaga=#{application.job_id} | enviada={application.created_at:%Y-%m-%d} | "
                f"expira={retention_label}"
            )
            if dry_run:
                continue

            try:
                self._anonymize_application(application, now)
                removed += 1
            except Exception as exc:
                errors += 1
                audit_event(
                    "application_lgpd_purge_error",
                    {
                        "application_id": application.pk,
                        "job_id": application.job_id,
                        "email_hash": _email_hash(application.email),
                        "error": str(exc),
                    },
                )
                self.stderr.write(self.style.ERROR(f"Erro ao anonimizar candidatura #{application.pk}: {exc}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run concluido. Nenhum dado foi alterado."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Limpeza LGPD concluida: {removed} removida(s), {errors} erro(s)."))

    def _anonymize_application(self, application: Application, now):
        email_hash = _email_hash(application.email)
        resume_key = application.resume_storage_key
        local_resume_name = application.resume.name if application.resume else ""

        if resume_key:
            try:
                delete_resume_from_supabase(resume_key)
            except StorageNotConfigured:
                pass

        if application.resume:
            try:
                application.resume.delete(save=False)
            except OSError:
                pass

        application.name = f"Candidato removido LGPD #{application.pk}"
        application.email = f"deleted+{application.pk}@lgpd.local"
        application.phone = ""
        application.message = "Dados removidos automaticamente por politica de retencao LGPD."
        application.resume = ""
        application.resume_text = ""
        application.resume_storage_key = ""
        application.resume_original_name = ""
        application.qa_score = 0
        application.deleted_at = now
        application.resume_deleted_at = now
        application.deletion_reason = "retencao_lgpd_30_dias"
        if not application.retention_until:
            application.retention_until = application.created_at + timedelta(days=30)
        application.save(
            update_fields=[
                "name",
                "email",
                "phone",
                "message",
                "resume",
                "resume_text",
                "resume_storage_key",
                "resume_original_name",
                "qa_score",
                "deleted_at",
                "resume_deleted_at",
                "deletion_reason",
                "retention_until",
            ]
        )
        audit_event(
            "application_lgpd_purged",
            {
                "application_id": application.pk,
                "job_id": application.job_id,
                "email_hash": email_hash,
                "resume_storage_key": bool(resume_key),
                "local_resume": bool(local_resume_name),
                "retention_until": application.retention_until.isoformat() if application.retention_until else "",
            },
        )


def _email_hash(email: str) -> str:
    normalized = (email or "").strip().lower().encode("utf-8")
    return sha256(normalized).hexdigest()[:16]
