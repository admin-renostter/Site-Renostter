"""RH Fase 2 — aviso do ERP (vagas mudaram) e comando exportar_para_erp."""
import time
from io import StringIO
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from careers.models import Application, Job
from careers.services import erp_client as E

SEGREDO = "f" * 64


@override_settings(RH_INTEGRATION_SECRET=SEGREDO, SECURE_SSL_REDIRECT=False,
                   CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "migr"}})
class AvisoTests(TestCase):
    def post(self, sig=None, ts=None):
        url = reverse("careers:erp_vagas_mudaram")
        ts = ts or int(time.time())
        sig = sig or E.assinar(SEGREDO, ts, "POST", url, E.sha256hex(b""))
        return self.client.post(url, b"", content_type="application/octet-stream", HTTP_X_RH_TIMESTAMP=str(ts), HTTP_X_RH_SIGNATURE=sig)

    def test_caminho_igual_ao_do_erp(self):
        self.assertEqual(reverse("careers:erp_vagas_mudaram"), "/integracao/erp/vagas-mudaram")

    def test_assinado_limpa_cache(self):
        cache.set(E.CACHE_PUBLICAS, [{"id": "x"}])
        cache.set(E.CACHE_ULTIMA, [{"id": "x"}])
        self.assertEqual(self.post().status_code, 204)
        self.assertIsNone(cache.get(E.CACHE_PUBLICAS))
        self.assertIsNotNone(cache.get(E.CACHE_ULTIMA), "a última lista continua para quando o ERP cair")

    def test_sem_assinatura_ou_velha(self):
        cache.set(E.CACHE_PUBLICAS, [{"id": "x"}])
        self.assertEqual(self.post(sig="0" * 64).status_code, 401)
        self.assertEqual(self.post(ts=int(time.time()) - 400).status_code, 401)
        self.assertIsNotNone(cache.get(E.CACHE_PUBLICAS))


class ExportarTests(TestCase):
    def setUp(self):
        base = dict(description="D", location="SP", contract_type="CLT", approval_status="aprovada")
        self.aberta = Job.objects.create(title="Aberta", status="publicada", **base)
        self.rascunho = Job.objects.create(title="Rascunho", status="rascunho", **base)
        Job.objects.create(title="Arquivada", status="arquivada", **base)
        self.app = Application.objects.create(job=self.aberta, name="Ana", email="ana@x.com", resume="curriculos/a.pdf", resume_original_name="a.pdf")

    @patch("careers.services.erp_client.ErpClient.importar_vaga")
    def test_simulacao_nao_grava(self, mock_imp):
        out = StringIO()
        call_command("exportar_para_erp", "--ator", "adm@renostter.com", stdout=out)
        mock_imp.assert_not_called()
        self.assertIn("SIMULAÇÃO", out.getvalue())
        self.assertIn("'Aberta' (publicada) → criar + enviar, aprovar", out.getvalue())
        self.assertNotIn("Arquivada", out.getvalue())

    @patch("careers.tasks.entregar_ao_erp", return_value="entregue")
    @patch("careers.services.erp_client.ErpClient.acao_vaga")
    @patch("careers.services.erp_client.ErpClient.importar_vaga")
    def test_apply_cria_com_origem_ref_e_entrega_sem_email(self, mock_imp, mock_acao, mock_entregar):
        def importar(dados, ator):
            return E.erp_para_job({"id": "vag_" + dados["origem_ref"].split(":")[1], "titulo": dados["titulo"], "situacao": "rascunho"}), False
        mock_imp.side_effect = importar
        mock_acao.side_effect = lambda vid, acao, ator, motivo=None: E.erp_para_job(
            {"id": vid, "titulo": "t", "situacao": {"enviar": "em_aprovacao", "aprovar": "aberta"}[acao]})
        call_command("exportar_para_erp", "--ator", "ADM@renostter.com", "--apply", stdout=StringIO())
        refs = [c.args[0]["origem_ref"] for c in mock_imp.call_args_list]
        self.assertEqual(refs, [f"site:{self.aberta.pk}", f"site:{self.rascunho.pk}"])
        self.assertEqual([c.args[1] for c in mock_acao.call_args_list], ["enviar", "aprovar"])
        self.assertEqual(mock_acao.call_args_list[0].args[2], "adm@renostter.com")
        self.app.refresh_from_db()
        self.assertEqual((self.app.erp_vaga_id, self.app.erp_status), (f"vag_{self.aberta.pk}", "pendente"))
        mock_entregar.assert_called_once_with(self.app.pk, enviar_email=False)

    @patch("careers.services.erp_client.ErpClient.acao_vaga")
    @patch("careers.services.erp_client.ErpClient.importar_vaga")
    def test_rodar_de_novo_nao_repete_acoes(self, mock_imp, mock_acao):
        mock_imp.return_value = (E.erp_para_job({"id": "vag_1", "titulo": "t", "situacao": "aberta"}), True)
        with patch("careers.tasks.entregar_ao_erp", return_value="entregue"):
            call_command("exportar_para_erp", "--ator", "adm@renostter.com", "--apply", stdout=StringIO())
        mock_acao.assert_not_called()


@override_settings(RH_EMAIL="rh@teste.com")
class EntregaMigracaoTests(TestCase):
    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", return_value="cdt_1")
    def test_enviar_email_false_vai_nos_dados(self, mock_env, _):
        from careers import tasks
        a = Application.objects.create(erp_vaga_id="vag_a", erp_status="pendente", erp_chave="22222222-2222-2222-2222-222222222222",
                                       name="Ana", email="ana@x.com", resume="", created_at=timezone.now())
        tasks.entregar_ao_erp(a.pk, enviar_email=False)
        self.assertIs(mock_env.call_args.args[0]["enviar_email"], False)
