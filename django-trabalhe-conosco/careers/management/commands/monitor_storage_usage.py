from __future__ import annotations

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from careers.services.audit import audit_event
from careers.services.storage import StorageNotConfigured
from careers.services.storage_usage import StorageUsage, get_render_storage_usage, get_supabase_storage_usage


class Command(BaseCommand):
    help = "Monitora consumo de storage no Render/Supabase e executa limpeza LGPD quando o limite configurado for atingido."

    def add_arguments(self, parser):
        parser.add_argument(
            "--threshold",
            type=float,
            default=float(settings.STORAGE_CLEANUP_THRESHOLD_PERCENT),
            help="Percentual para acionar limpeza. Padrao: STORAGE_CLEANUP_THRESHOLD_PERCENT.",
        )
        parser.add_argument("--cleanup", action="store_true", help="Executa purge_expired_applications se algum storage atingir o limite.")
        parser.add_argument("--dry-run", action="store_true", help="Simula a limpeza sem alterar candidaturas ou arquivos.")
        parser.add_argument("--days", type=int, default=30, help="Dias de retencao usados na limpeza LGPD.")
        parser.add_argument("--limit", type=int, default=500, help="Limite de candidaturas processadas por limpeza.")

    def handle(self, *args, **options):
        threshold = max(float(options["threshold"]), 1.0)
        usages = self._collect_usages()
        over_threshold = []

        for usage in usages:
            self._print_usage(usage)
            percent = usage.percent_used
            if percent is not None and percent >= threshold:
                over_threshold.append(usage)

        if not over_threshold:
            self.stdout.write(self.style.SUCCESS("Storage abaixo do limite configurado. Nenhuma limpeza acionada."))
            return

        audit_event(
            "storage_threshold_reached",
            {
                "threshold": threshold,
                "providers": [usage.provider for usage in over_threshold],
                "dry_run": options["dry_run"],
                "cleanup": options["cleanup"],
            },
        )
        self.stdout.write(self.style.WARNING(f"Limite de {threshold:.2f}% atingido por: {', '.join(u.provider for u in over_threshold)}."))

        if not options["cleanup"]:
            self.stdout.write(self.style.WARNING("Use --cleanup para executar a limpeza LGPD programada."))
            return

        call_command(
            "purge_expired_applications",
            days=options["days"],
            limit=options["limit"],
            dry_run=options["dry_run"],
        )

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run concluido. Nenhum dado foi alterado."))
            return

        self.stdout.write("Consumo apos limpeza:")
        for usage in self._collect_usages():
            self._print_usage(usage)

    def _collect_usages(self) -> list[StorageUsage]:
        usages = [get_render_storage_usage()]
        try:
            usages.append(get_supabase_storage_usage())
        except StorageNotConfigured as exc:
            self.stdout.write(self.style.WARNING(f"Supabase ignorado: {exc}"))
        return usages

    def _print_usage(self, usage: StorageUsage):
        used = _format_bytes(usage.used_bytes)
        total = _format_bytes(usage.total_bytes) if usage.has_quota else "limite nao configurado"
        percent = f"{usage.percent_used:.2f}%" if usage.percent_used is not None else "sem percentual"
        self.stdout.write(f"{usage.provider}: {used} usados de {total} ({percent}).")


def _format_bytes(value: int) -> str:
    size = float(max(value, 0))
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"
