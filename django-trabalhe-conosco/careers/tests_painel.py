"""RH Fase 2 — Painel RH do site agindo no ERP."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from careers.models import UserProfile
from careers.services.erp_client import MSG_SEM_CONTA, ErpErro, ErpIndisponivel, erp_para_job

VAGA = {"id": "vag_1", "titulo": "Tecnico", "descricao": "D", "tipo_contrato": "CLT", "situacao": "rascunho", "modalidade": "presencial",
        "salario_tipo": "a_combinar", "permissoes": {"editar": True, "aprovar": False, "gerir": True}}
FORM = {"title": "Tecnico", "description": "Instalacao", "requirements": "", "benefits": "", "location": "SP", "modality": "Hibrido",
        "contract_type": "CLT", "compensation_type": "a_combinar", "compensation_value": "", "area": "Operacao", "expires_at": ""}


class PainelTests(TestCase):
    def setUp(self):
        u = get_user_model().objects.create_user("ana", "Ana@Renostter.com", "x", is_staff=True)
        UserProfile.objects.create(user=u, role=UserProfile.Role.RECRUTADOR_AREA, must_change_password=False)
        self.client.force_login(u)

    @patch("careers.services.erp_client.ErpClient.listar_vagas", return_value=[erp_para_job(VAGA)])
    def test_lista_vem_do_erp_com_o_ator(self, mock_listar):
        r = self.client.get(reverse("careers:admin_jobs"))
        self.assertContains(r, "Tecnico")
        self.assertContains(r, reverse("careers:admin_job_action", args=["vag_1", "enviar"]))
        self.assertNotContains(r, reverse("careers:admin_job_action", args=["vag_1", "aprovar"]))
        self.assertEqual(mock_listar.call_args.args[0], "ana@renostter.com")

    @patch("careers.services.erp_client.ErpClient.criar_vaga", return_value=erp_para_job(VAGA))
    def test_criar_chama_o_erp(self, mock_criar):
        r = self.client.post(reverse("careers:admin_job_create"), FORM)
        self.assertRedirects(r, reverse("careers:admin_jobs"), fetch_redirect_response=False)
        dados, ator = mock_criar.call_args.args
        self.assertEqual(ator, "ana@renostter.com")
        self.assertEqual((dados["titulo"], dados["modalidade"], dados["salario_tipo"]), ("Tecnico", "hibrido", "a_combinar"))

    @patch("careers.services.erp_client.ErpClient.criar_vaga", side_effect=ErpErro("RH_ATOR_SEM_CONTA", MSG_SEM_CONTA, 403))
    def test_sem_conta_no_erp_mostra_a_mensagem(self, _):
        r = self.client.post(reverse("careers:admin_job_create"), FORM)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Peça ao administrador para criar seu acesso no ERP")

    @patch("careers.services.erp_client.ErpClient.acao_vaga", side_effect=ErpErro("RH_SEM_PERMISSAO", "Você não tem permissão para esta ação na vaga.", 403))
    def test_acao_com_erro_do_erp_vira_mensagem(self, mock_acao):
        r = self.client.post(reverse("careers:admin_job_action", args=["vag_1", "aprovar"]), follow=True)
        self.assertContains(r, "Você não tem permissão")
        self.assertEqual(mock_acao.call_args.args[:3], ("vag_1", "aprovar", "ana@renostter.com"))

    @patch("careers.services.erp_client.ErpClient.acao_vaga", return_value=erp_para_job(VAGA))
    def test_pedir_ajustes_envia_motivo(self, mock_acao):
        self.client.post(reverse("careers:admin_job_action", args=["vag_1", "pedir_ajustes"]), {"motivo": "Detalhar requisitos", "next": "approvals"})
        self.assertEqual(mock_acao.call_args.kwargs["motivo"], "Detalhar requisitos")

    def test_acao_desconhecida_recusada(self):
        r = self.client.post(reverse("careers:admin_job_action", args=["vag_1", "apagar"]))
        self.assertEqual(r.status_code, 403)

    @patch("careers.services.erp_client.ErpClient.listar_vagas", side_effect=ErpIndisponivel("fora"))
    def test_erp_fora_do_ar(self, _):
        r = self.client.get(reverse("careers:admin_jobs"))
        self.assertContains(r, "ERP indisponivel")

    @patch("careers.services.erp_client.ErpClient.editar_vaga", return_value=erp_para_job(VAGA))
    @patch("careers.services.erp_client.ErpClient.obter_vaga", return_value=erp_para_job(VAGA))
    def test_editar(self, _obter, mock_editar):
        r = self.client.get(reverse("careers:admin_job_update", args=["vag_1"]))
        self.assertContains(r, 'value="Tecnico"')
        self.client.post(reverse("careers:admin_job_update", args=["vag_1"]), {**FORM, "title": "Tecnico II"})
        self.assertEqual(mock_editar.call_args.args[0], "vag_1")
        self.assertEqual(mock_editar.call_args.args[1]["titulo"], "Tecnico II")
