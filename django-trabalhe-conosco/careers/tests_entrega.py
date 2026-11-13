"""RH Fase 2 — lista pública lendo o ERP, candidatura e entrega ao ERP."""
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from careers import tasks
from careers.models import Application
from careers.services.erp_client import ErpErro, ErpIndisponivel, erp_para_job

VAGAS = [
    {"id": "vag_a", "titulo": "Tecnico de refrigeracao", "descricao": "Instalacao de split", "area": "Operacao", "local": "SP",
     "modalidade": "presencial", "tipo_contrato": "CLT", "salario_tipo": "a_combinar", "situacao": "aberta"},
    {"id": "vag_b", "titulo": "Analista financeiro", "descricao": "Contas a pagar", "area": "Financeiro", "local": "SP",
     "modalidade": "remoto", "tipo_contrato": "PJ", "salario_tipo": "valor", "salario_valor": "R$ 5.000", "situacao": "aberta"},
]
MEDIA = tempfile.mkdtemp()


def publicas():
    return [erp_para_job(v) for v in VAGAS]


@override_settings(PRIVATE_MEDIA_ROOT=MEDIA, MEDIA_ROOT=MEDIA,
                   CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "entrega"}})
class ListaEFormularioTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()

    @patch("careers.services.erp_client.ErpClient.vagas_publicas", side_effect=publicas)
    def test_lista_publica_e_filtros(self, _):
        r = self.client.get(reverse("careers:job_list"))
        self.assertContains(r, "Tecnico de refrigeracao")
        self.assertContains(r, "Analista financeiro")
        r = self.client.get(reverse("careers:job_list"), {"modality": "Remoto"})
        self.assertNotContains(r, "Tecnico de refrigeracao")
        self.assertContains(r, "Analista financeiro")
        self.assertContains(r, "?vaga=vag_b")

    @patch("careers.services.erp_client.ErpClient.vagas_publicas", side_effect=publicas)
    def test_vaga_inexistente_redireciona(self, _):
        r = self.client.get(reverse("careers:apply") + "?vaga=vag_x", follow=True)
        self.assertContains(r, "nao esta mais aberta")

    @patch("careers.views.async_task")
    @patch("careers.services.erp_client.ErpClient.vagas_publicas", side_effect=publicas)
    def test_candidatura_grava_pendente_e_agenda_entrega(self, _, mock_async):
        r = self.client.get(reverse("careers:apply") + "?vaga=vag_a")
        self.assertContains(r, "banco de talentos")
        self.assertContains(r, "privacidade.html")
        client = Client(enforce_csrf_checks=True)
        resume = SimpleUploadedFile("curriculo.pdf", b"%PDF-1.4\n%%EOF", content_type="application/pdf")
        r = client.post(reverse("careers:apply") + "?vaga=vag_a", {"vaga": "vag_a", "name": "Joao", "email": "joao@example.com",
                        "phone": "11999999999", "message": "Oi", "resume": resume, "banco_talentos": "on"}, follow=True)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "data-careers-success-modal")
        self.assertContains(r, "Recebemos seu curriculo")
        a = Application.objects.get()
        self.assertEqual((a.erp_vaga_id, a.erp_status, a.banco_talentos), ("vag_a", "pendente", True))
        self.assertIsNotNone(a.erp_chave)
        self.assertIsNone(a.job_id)
        mock_async.assert_called_once_with("careers.tasks.entregar_ao_erp", a.pk)


@override_settings(PRIVATE_MEDIA_ROOT=MEDIA, MEDIA_ROOT=MEDIA, RH_EMAIL="rh@teste.com", RESEND_API_KEY="",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EntregaTests(TestCase):
    def criar(self, **kw):
        kw.setdefault("erp_chave", "11111111-1111-1111-1111-111111111111")
        a = Application.objects.create(
            erp_vaga_id="vag_a", erp_vaga_titulo="Tecnico", erp_status="pendente",
            name="Joao", email="joao@example.com", phone="11", message="m", banco_talentos=True,
            resume=SimpleUploadedFile("cv.pdf", b"%PDF-1.4 conteudo", content_type="application/pdf"), resume_original_name="cv.pdf", **kw)
        return a

    @patch("careers.tasks.extract_resume_text", return_value="split")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", return_value="cdt_1")
    def test_entregue_apaga_arquivo_e_anonimiza(self, mock_env, _):
        a = self.criar()
        caminho = a.resume.path
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "entregue")
        dados, arquivo, nome, chave = mock_env.call_args.args
        self.assertEqual((dados["vaga_id"], dados["email"], dados["banco_talentos"], dados["consentimento_versao"]), ("vag_a", "joao@example.com", True, "2026-10"))
        self.assertEqual(arquivo, b"%PDF-1.4 conteudo")
        self.assertEqual(chave, "11111111-1111-1111-1111-111111111111")
        a.refresh_from_db()
        self.assertEqual((a.erp_status, a.erp_id), ("entregue", "cdt_1"))
        self.assertEqual(a.email, f"deleted+{a.pk}@lgpd.local")
        self.assertFalse(a.resume)
        import os
        self.assertFalse(os.path.exists(caminho))
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "ignorada", "não reenvia o que já foi entregue")

    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", side_effect=ErpErro("RH_VAGA_FECHADA", "fechada", 409))
    def test_vaga_fechada_marca_recusada_e_avisa(self, *_):
        from django.core import mail
        a = self.criar()
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "recusada")
        a.refresh_from_db()
        self.assertEqual(a.erp_status, "recusada")
        self.assertEqual(mail.outbox[0].to, ["joao@example.com"])
        self.assertFalse(a.resume)

    @patch("django_q.tasks.schedule")
    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", side_effect=ErpIndisponivel("fora"))
    def test_falha_de_rede_reagenda(self, _env, _ext, mock_schedule):
        a = self.criar()
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "reagendada")
        a.refresh_from_db()
        self.assertEqual((a.erp_status, a.erp_tentativas), ("pendente", 1))
        self.assertTrue(a.resume, "mantém o currículo até entregar")
        kw = mock_schedule.call_args.kwargs
        self.assertAlmostEqual((kw["next_run"] - timezone.now()).total_seconds(), 60, delta=5)

    @patch("django_q.tasks.schedule")
    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", side_effect=ErpIndisponivel("fora"))
    def test_depois_de_3_dias_falha_e_avisa_responsavel(self, _env, _ext, mock_schedule):
        from django.core import mail
        a = self.criar(erp_tentativas=12)
        Application.objects.filter(pk=a.pk).update(created_at=timezone.now() - timedelta(days=3))
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "reagendada")
        a.refresh_from_db()
        self.assertEqual(a.erp_status, "falhou")
        mock_schedule.assert_not_called()
        self.assertEqual(mail.outbox[0].to, ["rh@teste.com"])

    def test_atrasos(self):
        self.assertEqual([tasks._proximo_atraso(n) for n in range(1, 7)], [1, 5, 15, 60, 360, 360])


@override_settings(PRIVATE_MEDIA_ROOT=MEDIA, MEDIA_ROOT=MEDIA, RH_EMAIL="rh@teste.com", RESEND_API_KEY="",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EntregaRobustezTests(TestCase):
    criar = EntregaTests.criar

    @patch("django_q.tasks.schedule")
    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", side_effect=ErpErro("RH_ASSINATURA_EXPIRADA", "Assinatura expirada.", 401))
    def test_401_tenta_de_novo(self, *_):
        a = self.criar()
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "reagendada")
        a.refresh_from_db()
        self.assertEqual(a.erp_status, "pendente")
        self.assertTrue(a.resume)

    @patch("careers.tasks.extract_resume_text", return_value="")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura", side_effect=ErpErro("RH_VAGA_NAO_ENCONTRADA", "Vaga não encontrada.", 404))
    def test_vaga_nao_encontrada_guarda_dados_e_avisa_rh(self, *_):
        from django.core import mail
        a = self.criar()
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "falhou")
        a.refresh_from_db()
        self.assertEqual(a.email, "joao@example.com")
        self.assertTrue(a.resume)
        self.assertEqual(mail.outbox[0].to, ["rh@teste.com"])

    @patch("django_q.tasks.schedule")
    @patch("careers.services.erp_client.ErpClient.enviar_candidatura")
    def test_curriculo_ilegivel_nao_entrega_sem_arquivo(self, mock_env, _):
        a = self.criar()
        import os
        os.remove(a.resume.path)
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "reagendada")
        mock_env.assert_not_called()

    @patch("careers.services.erp_client.ErpClient.enviar_candidatura")
    def test_outra_execucao_ja_enviando_e_ignorada(self, mock_env):
        a = self.criar()
        Application.objects.filter(pk=a.pk).update(erp_status="enviando")
        self.assertEqual(tasks.entregar_ao_erp(a.pk), "ignorada")
        mock_env.assert_not_called()

    @patch("django_q.tasks.async_task")
    def test_reenfileira_paradas(self, mock_async):
        parada = self.criar()
        Application.objects.filter(pk=parada.pk).update(created_at=timezone.now() - timedelta(minutes=20))
        travada = self.criar(erp_chave="33333333-3333-3333-3333-333333333333")
        Application.objects.filter(pk=travada.pk).update(erp_status="enviando", erp_ultima_tentativa=timezone.now() - timedelta(hours=1))
        recente = self.criar(erp_chave="44444444-4444-4444-4444-444444444444")
        self.assertEqual(tasks.reenfileirar_pendentes(), 2)
        self.assertEqual(sorted(c.args[1] for c in mock_async.call_args_list), sorted([parada.pk, travada.pk]))
        travada.refresh_from_db()
        self.assertEqual(travada.erp_status, "pendente")
        self.assertNotIn(recente.pk, [c.args[1] for c in mock_async.call_args_list])

    def test_agendamento_criado_uma_vez(self):
        from django_q.models import Schedule
        tasks.garantir_reenfileiramento()
        tasks.garantir_reenfileiramento()
        self.assertEqual(Schedule.objects.filter(name="rh-reenfileirar-pendentes").count(), 1)
