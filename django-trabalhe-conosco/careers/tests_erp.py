"""RH Fase 2 — cliente do ERP (assinatura, cache, erros)."""
import hashlib
from datetime import date
from unittest.mock import MagicMock, patch

import requests
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from careers.services import erp_client as E

SEGREDO = "a" * 64


def resposta(status=200, body=None):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = body if body is not None else {"success": True, "data": []}
    return r


class AssinaturaTests(SimpleTestCase):
    def test_vetor_compartilhado_com_o_erp(self):
        # mesmo vetor de cora-api/tests/rhIntegracao.test.js
        h = E.sha256hex('{"a":1}')
        self.assertEqual(h, "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862")
        self.assertEqual(E.assinar(SEGREDO, 1793500000, "post", "/api/rh/integracao/vagas", h),
                         "8db6a77accd9b7373257c271177a5c8d171b428fa0746d9a292119d4d0affe1b")
        self.assertEqual(E.assinar(SEGREDO, 1793500000, "POST", "/api/rh/integracao/vagas", h, " Ana@Renostter.com ", "k-1"),
                         "23f6cdf9c1f4dd46e01ebeae0f82b0121459e1bb235f008637e5ace2c0d9e3f4")

    def test_verificar_assinatura(self):
        sig = E.assinar(SEGREDO, 1000, "POST", "/x", E.sha256hex(""))
        self.assertTrue(E.verificar_assinatura(SEGREDO, "1000", sig, "POST", "/x", E.sha256hex(""), agora=1100))
        self.assertFalse(E.verificar_assinatura(SEGREDO, "1000", sig, "POST", "/x", E.sha256hex(""), agora=1400))
        self.assertFalse(E.verificar_assinatura(SEGREDO, "1000", sig, "POST", "/y", E.sha256hex(""), agora=1100))
        self.assertFalse(E.verificar_assinatura("", "1000", sig, "POST", "/x", E.sha256hex(""), agora=1100))


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "erp-tests"}})
class ClienteTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.c = E.ErpClient("http://erp:3000", SEGREDO)

    @patch("careers.services.erp_client.requests.request")
    def test_corpo_assinado_e_ator(self, req):
        req.return_value = resposta(201, {"success": True, "data": {"id": "vag_1", "titulo": "T", "situacao": "rascunho"}})
        v = self.c.criar_vaga({"titulo": "Técnico"}, ator=" Ana@Renostter.com ")
        self.assertEqual(v.pk, "vag_1")
        metodo, url = req.call_args.args
        kw = req.call_args.kwargs
        self.assertEqual((metodo, url), ("POST", "http://erp:3000/api/rh/integracao/vagas"))
        h = kw["headers"]
        self.assertEqual(h["X-RH-Ator"], "ana@renostter.com")
        esperado = E.assinar(SEGREDO, int(h["X-RH-Timestamp"]), "POST", "/api/rh/integracao/vagas", hashlib.sha256(kw["data"]).hexdigest(), "ana@renostter.com")
        self.assertEqual(h["X-RH-Signature"], esperado)
        self.assertIn("Técnico".encode(), kw["data"])

    @patch("careers.services.erp_client.requests.request")
    def test_cache_e_ultima_lista_quando_erp_cai(self, req):
        req.return_value = resposta(200, {"success": True, "data": [{"id": "vag_a", "titulo": "A", "situacao": "aberta", "salario_tipo": "pretensao"}]})
        self.assertEqual([v.pk for v in self.c.vagas_publicas()], ["vag_a"])
        self.c.vagas_publicas()
        self.assertEqual(req.call_count, 1, "segunda leitura vem do cache")
        cache.delete(E.CACHE_PUBLICAS)
        req.side_effect = requests.ConnectionError("fora")
        lista = self.c.vagas_publicas()
        self.assertEqual([v.pk for v in lista], ["vag_a"], "última lista conhecida")
        self.assertEqual(lista[0].compensation_type, "pretensao_salarial")

    @patch("careers.services.erp_client.requests.request")
    def test_sem_cache_e_erp_fora_lista_vazia(self, req):
        req.side_effect = requests.Timeout("lento")
        self.assertEqual(self.c.vagas_publicas(), [])

    @patch("careers.services.erp_client.requests.request")
    def test_4xx_vira_erp_erro_com_mensagem(self, req):
        req.return_value = resposta(403, {"success": False, "code": "RH_ATOR_SEM_CONTA", "error": E.MSG_SEM_CONTA})
        with self.assertRaises(E.ErpErro) as ctx:
            self.c.acao_vaga("vag_1", "aprovar", ator="x@y.com")
        self.assertEqual(ctx.exception.code, "RH_ATOR_SEM_CONTA")
        self.assertEqual(ctx.exception.status, 403)
        req.return_value = resposta(502, {})
        with self.assertRaises(E.ErpIndisponivel):
            self.c.listar_vagas("x@y.com")

    @patch("careers.services.erp_client.requests.request")
    def test_candidatura_multipart_assinada(self, req):
        req.return_value = resposta(201, {"success": True, "data": {"id": "cdt_9"}})
        cid = self.c.enviar_candidatura({"vaga_id": "vag_a", "nome": "João"}, b"%PDF-1.4", "cv.pdf", "chave-1")
        self.assertEqual(cid, "cdt_9")
        kw = req.call_args.kwargs
        dados = kw["files"]["dados"][1].decode()
        hash_corpo = E.sha256hex(dados + "\n" + E.sha256hex(b"%PDF-1.4"))
        self.assertEqual(kw["headers"]["X-RH-Signature"], E.assinar(SEGREDO, int(kw["headers"]["X-RH-Timestamp"]), "POST", "/api/rh/integracao/candidaturas", hash_corpo, "", "chave-1"))
        self.assertEqual(kw["headers"]["X-Idempotency-Key"], "chave-1")
        self.assertEqual(kw["files"]["curriculo"][0], "cv.pdf")

    def test_sem_configuracao_e_indisponivel(self):
        with self.assertRaises(E.ErpIndisponivel):
            E.ErpClient("", "").listar_vagas("x@y.com")


class ConversaoTests(SimpleTestCase):
    def test_job_para_erp(self):
        d = E.job_para_erp({"title": "T", "description": "D", "location": "SP", "modality": "Hibrido", "contract_type": "CLT",
                            "compensation_type": "valor_salarial", "compensation_value": "R$ 3.000", "area": "Op", "expires_at": date(2026, 12, 1)})
        self.assertEqual(d["modalidade"], "hibrido")
        self.assertEqual(d["salario_tipo"], "valor")
        self.assertEqual(d["salario_valor"], "R$ 3.000")
        self.assertEqual(d["expira_em"], "2026-12-01")
        self.assertEqual(E.job_para_erp({"compensation_type": "pretensao_salarial", "compensation_value": "x"})["salario_valor"], "")

    def test_erp_para_job(self):
        v = E.erp_para_job({"id": "vag_1", "titulo": "T", "modalidade": "remoto", "salario_tipo": "valor", "salario_valor": "R$ 1",
                            "situacao": "aberta", "expira_em": "2026-12-01T00:00:00.000Z", "contagens": {"recebido": 2, "triagem": 1}})
        self.assertEqual(v.modality, "Remoto")
        self.assertEqual(v.compensation_label, "R$ 1")
        self.assertEqual(v.expires_at, date(2026, 12, 1))
        self.assertEqual(v.total_applications, 3)
        self.assertEqual(v.get_status_display(), "Publicada")
