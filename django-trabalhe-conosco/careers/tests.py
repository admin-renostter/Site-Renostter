from unittest.mock import patch
from datetime import timedelta

from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from careers.models import Application, Job
from careers.services.storage import create_signed_resume_url, download_resume_from_supabase, ensure_private_resume_bucket
from careers.views import _serve_supabase_resume


class SupabaseStorageTests(SimpleTestCase):
    @override_settings(
        SUPABASE_URL="https://abc.supabase.co/rest/v1/",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
        SUPABASE_SIGNED_URL_TTL_SECONDS=3600,
    )
    @patch("careers.services.storage.requests.get")
    def test_download_resume_uses_authenticated_storage_endpoint(self, mock_get):
        mock_get.return_value.content = b"%PDF-1.4"
        mock_get.return_value.headers = {"Content-Type": "application/pdf"}
        mock_get.return_value.raise_for_status.return_value = None

        downloaded_file = download_resume_from_supabase("curriculos/vaga 1/cv teste.pdf")

        self.assertEqual(downloaded_file.content, b"%PDF-1.4")
        self.assertEqual(downloaded_file.content_type, "application/pdf")
        mock_get.assert_called_once()
        self.assertEqual(
            mock_get.call_args.args[0],
            "https://abc.supabase.co/storage/v1/object/curriculos/curriculos/vaga%201/cv%20teste.pdf",
        )
        self.assertEqual(mock_get.call_args.kwargs["headers"]["Authorization"], "Bearer sb_secret_test")

    @override_settings(
        SUPABASE_URL="https://abc.supabase.co/rest/v1/",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
        SUPABASE_SIGNED_URL_TTL_SECONDS=3600,
    )
    @patch("careers.services.storage.requests.post")
    def test_signed_url_uses_supabase_sign_endpoint(self, mock_post):
        mock_post.return_value.json.return_value = {
            "signedURL": "/storage/v1/object/sign/curriculos/curriculos/vaga-1/cv.pdf?token=abc"
        }
        mock_post.return_value.raise_for_status.return_value = None

        signed_url = create_signed_resume_url("curriculos/vaga-1/cv.pdf")

        self.assertEqual(
            signed_url,
            "https://abc.supabase.co/storage/v1/object/sign/curriculos/curriculos/vaga-1/cv.pdf?token=abc",
        )
        self.assertEqual(
            mock_post.call_args.args[0],
            "https://abc.supabase.co/storage/v1/object/sign/curriculos/curriculos/vaga-1/cv.pdf",
        )

    @override_settings(
        SUPABASE_URL="https://abc.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
    )
    @patch("careers.views.download_resume_from_supabase")
    def test_panel_serves_supabase_resume_as_attachment(self, mock_download):
        mock_download.return_value.content = b"%PDF-1.4"
        mock_download.return_value.content_type = "application/pdf"
        application = type(
            "ApplicationStub",
            (),
            {
                "resume_original_name": "curriculo-renostter.pdf",
            },
        )()

        response = _serve_supabase_resume(application, "curriculos/vaga-1/cv.pdf")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("curriculo-renostter.pdf", response["Content-Disposition"])
        self.assertEqual(response.content, b"%PDF-1.4")

    @override_settings(
        SUPABASE_URL="https://abc.supabase.co/rest/v1/",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
    )
    @patch("careers.services.storage.requests.get")
    def test_bucket_check_rejects_public_bucket(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"id": "curriculos", "public": True}

        with self.assertRaises(RuntimeError):
            ensure_private_resume_bucket()

    @override_settings(
        SUPABASE_URL="https://abc.supabase.co/rest/v1/",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
    )
    @patch("careers.services.storage.requests.post")
    @patch("careers.services.storage.requests.get")
    def test_bucket_check_creates_private_bucket_when_missing(self, mock_get, mock_post):
        mock_get.return_value.status_code = 404
        mock_post.return_value.raise_for_status.return_value = None

        result = ensure_private_resume_bucket()

        self.assertEqual(result, "created")
        self.assertEqual(mock_get.call_args.args[0], "https://abc.supabase.co/storage/v1/bucket/curriculos")
        self.assertEqual(mock_post.call_args.args[0], "https://abc.supabase.co/storage/v1/bucket")
        self.assertIs(mock_post.call_args.kwargs["json"]["public"], False)


class PublicApplicationFlowTests(TestCase):
    def setUp(self):
        self.job = Job.objects.create(
            title="Tecnico em Climatizacao",
            description="Atendimento tecnico em campo.",
            location="Sao Paulo",
            contract_type=Job.ContractType.PJ,
            status=Job.Status.PUBLICADA,
            approval_status=Job.ApprovalStatus.APROVADA,
            published_at=timezone.now(),
        )

    @patch("careers.views.async_task")
    @patch("careers.views.send_application_emails")
    @patch("careers.views.upload_resume_to_supabase")
    def test_public_application_post_does_not_require_csrf_cookie(self, mock_upload, mock_send_email, mock_async_task):
        mock_upload.return_value.key = "curriculos/vaga-1/teste.pdf"
        client = Client(enforce_csrf_checks=True)
        resume = SimpleUploadedFile("curriculo.pdf", b"%PDF-1.4\n%%EOF", content_type="application/pdf")

        response = client.post(
            f"{reverse('careers:apply')}?vaga={self.job.pk}",
            {
                "vaga": str(self.job.pk),
                "name": "Joao Candidato",
                "email": "joao@example.com",
                "phone": "11999999999",
                "message": "Tenho experiencia tecnica.",
                "resume": resume,
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Recebemos seu curriculo")
        self.assertContains(response, "Nossa equipe avaliara suas informacoes")
        self.assertContains(response, 'data-careers-success-modal')
        self.assertEqual(Application.objects.count(), 1)
        self.assertEqual(Application.objects.first().resume_storage_key, "curriculos/vaga-1/teste.pdf")
        mock_send_email.assert_called_once()
        mock_async_task.assert_called_once()


class LgpdRetentionCommandTests(TestCase):
    def setUp(self):
        self.job = Job.objects.create(
            title="Tecnico em Climatizacao",
            description="Atendimento tecnico em campo.",
            location="Sao Paulo",
            contract_type=Job.ContractType.PJ,
            status=Job.Status.PUBLICADA,
            approval_status=Job.ApprovalStatus.APROVADA,
            published_at=timezone.now(),
        )

    @patch("careers.management.commands.purge_expired_applications.delete_resume_from_supabase")
    def test_dry_run_does_not_anonymize_expired_application(self, mock_delete):
        application = self._create_application(days_old=31)

        call_command("purge_expired_applications", "--dry-run")

        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)
        self.assertEqual(application.email, "candidato@example.com")
        mock_delete.assert_not_called()

    @patch("careers.management.commands.purge_expired_applications.delete_resume_from_supabase")
    def test_retention_keeps_applications_younger_than_30_days(self, mock_delete):
        application = self._create_application(days_old=29)

        call_command("purge_expired_applications")

        application.refresh_from_db()
        self.assertIsNone(application.deleted_at)
        self.assertEqual(application.email, "candidato@example.com")
        mock_delete.assert_not_called()

    @patch("careers.management.commands.purge_expired_applications.audit_event")
    @patch("careers.management.commands.purge_expired_applications.delete_resume_from_supabase")
    def test_retention_anonymizes_application_at_30_days(self, mock_delete, mock_audit):
        application = self._create_application(days_old=30)

        call_command("purge_expired_applications")

        application.refresh_from_db()
        self.assertIsNotNone(application.deleted_at)
        self.assertEqual(application.email, f"deleted+{application.pk}@lgpd.local")
        self.assertEqual(application.phone, "")
        self.assertEqual(application.resume_storage_key, "")
        self.assertEqual(application.deletion_reason, "retencao_lgpd_30_dias")
        mock_delete.assert_called_once_with("curriculos/vaga-1/teste.pdf")
        mock_audit.assert_called()

    def _create_application(self, days_old: int):
        created_at = timezone.now() - timedelta(days=days_old)
        application = Application.objects.create(
            job=self.job,
            name="Candidato Teste",
            email="candidato@example.com",
            phone="11999999999",
            message="Mensagem do candidato",
            resume="curriculos/vaga-1/teste.pdf",
            resume_storage_key="curriculos/vaga-1/teste.pdf",
            resume_original_name="curriculo.pdf",
            retention_until=created_at + timedelta(days=30),
        )
        Application.objects.filter(pk=application.pk).update(created_at=created_at)
        application.refresh_from_db()
        return application
