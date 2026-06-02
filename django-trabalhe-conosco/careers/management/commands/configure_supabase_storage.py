from __future__ import annotations

from uuid import uuid4

from django.core.management.base import BaseCommand, CommandError

from careers.services.storage import (
    delete_resume_from_supabase,
    download_resume_from_supabase,
    ensure_private_resume_bucket,
    upload_bytes_to_supabase,
)


class Command(BaseCommand):
    help = "Verifica/cria o bucket privado de curriculos no Supabase e testa upload/download."

    def handle(self, *args, **options):
        try:
            bucket_status = ensure_private_resume_bucket()
            self.stdout.write(self.style.SUCCESS(f"Bucket de curriculos: {bucket_status}."))

            test_key = f"qa/storage-health/{uuid4().hex}.txt"
            test_content = b"renostter-storage-ok"
            upload_bytes_to_supabase(test_key, test_content, "text/plain")
            self.stdout.write(self.style.SUCCESS("Upload de teste: OK."))

            downloaded_file = download_resume_from_supabase(test_key)
            if downloaded_file.content != test_content:
                raise CommandError("Download de teste retornou conteudo diferente do enviado.")
            self.stdout.write(self.style.SUCCESS("Download de teste: OK."))

            delete_resume_from_supabase(test_key)
            self.stdout.write(self.style.SUCCESS("Limpeza do arquivo de teste: OK."))
            self.stdout.write(self.style.SUCCESS("Supabase Storage configurado e validado."))
        except Exception as exc:
            raise CommandError(f"Falha ao configurar Supabase Storage: {exc}") from exc
