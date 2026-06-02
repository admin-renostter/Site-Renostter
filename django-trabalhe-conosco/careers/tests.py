from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from careers.services.storage import create_signed_resume_url, download_resume_from_supabase
from careers.views import _serve_supabase_resume


class SupabaseStorageTests(SimpleTestCase):
    @override_settings(
        SUPABASE_URL="https://abc.supabase.co",
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
        SUPABASE_URL="https://abc.supabase.co",
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
