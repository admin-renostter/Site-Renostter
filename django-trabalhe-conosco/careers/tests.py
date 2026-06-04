from unittest.mock import patch
from datetime import timedelta

from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from careers.forms import JobAdminForm
from careers.models import Application, Job
from careers.services.storage import create_signed_resume_url, download_resume_from_supabase, ensure_private_resume_bucket
from careers.services.storage_usage import StorageUsage, get_supabase_storage_usage
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

    @override_settings(
        SUPABASE_URL="https://abc.supabase.co/rest/v1/",
        SUPABASE_SERVICE_ROLE_KEY="sb_secret_test",
        SUPABASE_STORAGE_BUCKET="curriculos",
        SUPABASE_STORAGE_LIMIT_BYTES=1000,
    )
    @patch("careers.services.storage_usage.requests.post")
    def test_supabase_usage_sums_bucket_files(self, mock_post):
        mock_post.return_value.json.return_value = [
            {"name": "cv-1.pdf", "metadata": {"size": 125}},
            {"name": "cv-2.pdf", "metadata": {"size": 375}},
        ]
        mock_post.return_value.raise_for_status.return_value = None

        usage = get_supabase_storage_usage()

        self.assertEqual(usage.used_bytes, 500)
        self.assertEqual(usage.total_bytes, 1000)
        self.assertEqual(usage.percent_used, 50.0)


class StorageMonitorCommandTests(SimpleTestCase):
    @patch("careers.management.commands.monitor_storage_usage.call_command")
    @patch("careers.management.commands.monitor_storage_usage.audit_event")
    @patch("careers.management.commands.monitor_storage_usage.get_supabase_storage_usage")
    @patch("careers.management.commands.monitor_storage_usage.get_render_storage_usage")
    def test_monitor_triggers_lgpd_cleanup_above_threshold(self, mock_render, mock_supabase, mock_audit, mock_call_command):
        mock_render.return_value = StorageUsage("render", used_bytes=10, total_bytes=100)
        mock_supabase.return_value = StorageUsage("supabase", used_bytes=96, total_bytes=100)

        call_command("monitor_storage_usage", cleanup=True, threshold=95)

        mock_call_command.assert_called_once_with(
            "purge_expired_applications",
            days=30,
            limit=500,
            dry_run=False,
        )
        mock_audit.assert_called_once()

    @patch("careers.management.commands.monitor_storage_usage.call_command")
    @patch("careers.management.commands.monitor_storage_usage.get_supabase_storage_usage")
    @patch("careers.management.commands.monitor_storage_usage.get_render_storage_usage")
    def test_monitor_does_not_cleanup_below_threshold(self, mock_render, mock_supabase, mock_call_command):
        mock_render.return_value = StorageUsage("render", used_bytes=10, total_bytes=100)
        mock_supabase.return_value = StorageUsage("supabase", used_bytes=94, total_bytes=100)

        call_command("monitor_storage_usage", cleanup=True, threshold=95)

        mock_call_command.assert_not_called()


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


class HealthCheckTests(TestCase):
    def test_health_check_is_public_and_reports_ok(self):
        response = self.client.get(reverse("health_check"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class JobCompensationFormTests(SimpleTestCase):
    def _valid_payload(self, **overrides):
        payload = {
            "title": "Tecnico em Climatizacao",
            "description": "Atendimento tecnico em campo.",
            "requirements": "",
            "benefits": "",
            "location": "Sao Paulo/SP",
            "modality": Job.Modality.PRESENCIAL,
            "contract_type": Job.ContractType.PJ,
            "compensation_type": Job.CompensationType.A_COMBINAR,
            "compensation_value": "",
            "area": "Operacoes",
            "expires_at": "",
            "internal_notes": "",
        }
        payload.update(overrides)
        return payload

    def test_salary_value_is_required_when_type_is_fixed_salary(self):
        form = JobAdminForm(data=self._valid_payload(compensation_type=Job.CompensationType.VALOR_SALARIAL))

        self.assertFalse(form.is_valid())
        self.assertIn("compensation_value", form.errors)

    def test_non_salary_type_clears_salary_value(self):
        form = JobAdminForm(
            data=self._valid_payload(
                compensation_type=Job.CompensationType.PRETENSAO_SALARIAL,
                compensation_value="R$ 3.000,00",
            )
        )

        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data["compensation_value"], "")


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
