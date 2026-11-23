"""Cliente do ERP Renostter (RH Fase 2): vagas com fonte única no ERP.

Toda chamada é assinada com HMAC-SHA256 (RH_INTEGRATION_SECRET), no mesmo formato
de cora-api/services/rh/integracao.js:
    X-RH-Signature = hex HMAC(segredo, f"{ts}\\n{MÉTODO}\\n{caminho?query}\\n{hash_corpo}\\n{ator}\\n{chave}")
(ator = X-RH-Ator em minúsculas ou "", chave = X-Idempotency-Key ou "")
JSON: hash_corpo = sha256(corpo enviado). Candidatura (multipart):
hash_corpo = sha256(dados + "\\n" + sha256(arquivo ou b"")).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core.cache import cache
from django.urls import reverse

logger = logging.getLogger(__name__)

CACHE_PUBLICAS = "erp:vagas_publicas"
CACHE_ULTIMA = "erp:vagas_publicas:ultima"
CACHE_SEGUNDOS = 60
MSG_SEM_CONTA = "Peça ao administrador para criar seu acesso no ERP com este e-mail."


class ErpIndisponivel(Exception):
    """ERP fora do ar, lento ou com erro interno."""


class ErpErro(Exception):
    """O ERP recusou o pedido (4xx); `mensagem` é o texto para o usuário."""

    def __init__(self, code: str, mensagem: str, status: int):
        super().__init__(f"{status} {code}: {mensagem}")
        self.code, self.mensagem, self.status = code, mensagem, status


def sha256hex(dado: bytes | str | None) -> str:
    if dado is None:
        dado = b""
    if isinstance(dado, str):
        dado = dado.encode("utf-8")
    return hashlib.sha256(dado).hexdigest()


def assinar(segredo: str, ts: int, metodo: str, caminho: str, hash_corpo: str, ator: str = "", chave: str = "") -> str:
    base = f"{ts}\n{metodo.upper()}\n{caminho}\n{hash_corpo}\n{(ator or '').strip().lower()}\n{chave or ''}"
    return hmac.new(segredo.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()


def verificar_assinatura(segredo: str, ts: str, assinatura: str, metodo: str, caminho: str, hash_corpo: str, agora: int | None = None) -> bool:
    """Usado pelo endpoint que recebe avisos do ERP (tolerância de 300 s)."""
    if not segredo or not ts or not assinatura:
        return False
    try:
        t = int(ts)
    except ValueError:
        return False
    if abs((agora or int(time.time())) - t) > 300:
        return False
    return hmac.compare_digest(assinar(segredo, t, metodo, caminho, hash_corpo), assinatura)


# ───────────────────────── conversões site ↔ ERP ─────────────────────────
MODALIDADE_SITE = {"presencial": "Presencial", "remoto": "Remoto", "hibrido": "Hibrido"}
SALARIO_PARA_ERP = {"a_combinar": "a_combinar", "valor_salarial": "valor", "pretensao_salarial": "pretensao"}
SALARIO_PARA_SITE = {v: k for k, v in SALARIO_PARA_ERP.items()}
SALARIO_ROTULO = {"a_combinar": "A combinar", "valor_salarial": "Valor salarial", "pretensao_salarial": "Pretensao salarial"}
SITUACAO_ROTULO = {
    "rascunho": "Rascunho", "em_aprovacao": "Em aprovacao", "ajustes_solicitados": "Ajustes solicitados",
    "aberta": "Publicada", "pausada": "Pausada", "preenchida": "Preenchida", "encerrada": "Encerrada", "rejeitada": "Rejeitada",
}


def job_para_erp(d: dict) -> dict:
    """Campos do formulário do Painel RH (nomes do modelo Job) → corpo da API do ERP."""
    out: dict[str, Any] = {}
    mapa = {"title": "titulo", "description": "descricao", "requirements": "requisitos", "benefits": "beneficios",
            "location": "local", "area": "area", "contract_type": "tipo_contrato"}
    for k, v in mapa.items():
        if k in d:
            out[v] = d[k] or ""
    if "modality" in d:
        out["modalidade"] = (d["modality"] or "Presencial").lower()
    if "compensation_type" in d:
        out["salario_tipo"] = SALARIO_PARA_ERP.get(d["compensation_type"] or "a_combinar", "a_combinar")
        out["salario_valor"] = (d.get("compensation_value") or "") if out["salario_tipo"] == "valor" else ""
    if "expires_at" in d:
        e = d["expires_at"]
        out["expira_em"] = e.isoformat() if isinstance(e, date) else (e or "")
    return out


def _data(v) -> date | None:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


@dataclass
class ErpVaga:
    """Vaga do ERP com os atributos que os templates do site já usam (antes vinham do modelo Job)."""

    pk: str
    title: str
    description: str = ""
    requirements: str = ""
    benefits: str = ""
    location: str = ""
    modality: str = "Presencial"
    contract_type: str = ""
    compensation_type: str = "a_combinar"
    compensation_value: str = ""
    area: str = ""
    status: str = "rascunho"
    rejection_reason: str = ""
    expires_at: date | None = None
    published_at: str | None = None
    updated_at: str | None = None
    created_by: str = ""
    total_applications: int = 0
    permissoes: dict = field(default_factory=dict)

    @property
    def id(self):
        return self.pk

    @property
    def area_owner(self):
        return self.area

    @property
    def compensation_label(self) -> str:
        if self.compensation_type == "valor_salarial" and self.compensation_value:
            return self.compensation_value
        return SALARIO_ROTULO.get(self.compensation_type, "A combinar")

    def get_status_display(self) -> str:
        return SITUACAO_ROTULO.get(self.status, self.status)

    def get_absolute_url(self) -> str:
        return f"{reverse('careers:apply')}?vaga={self.pk}"

    @property
    def is_open(self) -> bool:
        return self.status == "aberta" and (self.expires_at is None or self.expires_at >= date.today())

    def as_form_initial(self) -> dict:
        return {"title": self.title, "description": self.description, "requirements": self.requirements, "benefits": self.benefits,
                "location": self.location, "modality": self.modality, "contract_type": self.contract_type,
                "compensation_type": self.compensation_type, "compensation_value": self.compensation_value,
                "area": self.area, "expires_at": self.expires_at}


def erp_para_job(v: dict) -> ErpVaga:
    contagens = v.get("contagens") or {}
    return ErpVaga(
        pk=v["id"], title=v.get("titulo") or "", description=v.get("descricao") or "", requirements=v.get("requisitos") or "",
        benefits=v.get("beneficios") or "", location=v.get("local") or "", modality=MODALIDADE_SITE.get(v.get("modalidade") or "", "Presencial"),
        contract_type=v.get("tipo_contrato") or "", compensation_type=SALARIO_PARA_SITE.get(v.get("salario_tipo") or "", "a_combinar"),
        compensation_value=v.get("salario_valor") or "", area=v.get("area") or "", status=v.get("situacao") or "aberta",
        rejection_reason=v.get("motivo_ajuste") or "", expires_at=_data(v.get("expira_em")), published_at=v.get("publicada_em"),
        updated_at=v.get("updated_at"), created_by=v.get("criada_por_nome") or v.get("criada_por") or "",
        total_applications=sum(int(n) for n in contagens.values()) if isinstance(contagens, dict) else 0,
        permissoes=v.get("permissoes") or {},
    )


# ───────────────────────── cliente ─────────────────────────
class ErpClient:
    def __init__(self, base_url: str | None = None, secret: str | None = None, timeout: float = 5):
        self.base_url = (base_url if base_url is not None else getattr(settings, "ERP_INTERNAL_URL", "")).rstrip("/")
        self.secret = secret if secret is not None else getattr(settings, "RH_INTEGRATION_SECRET", "")
        self.timeout = timeout

    def _cabecalhos(self, metodo: str, caminho: str, hash_corpo: str, ator: str | None = None, chave: str | None = None) -> dict:
        ts = int(time.time())
        ator = (ator or "").strip().lower()
        h = {"X-RH-Timestamp": str(ts), "X-RH-Signature": assinar(self.secret, ts, metodo, caminho, hash_corpo, ator, chave or "")}
        if ator:
            h["X-RH-Ator"] = ator
        if chave:
            h["X-Idempotency-Key"] = chave
        return h

    def _enviar(self, metodo: str, caminho: str, *, corpo: bytes = b"", headers: dict, files=None):
        if not self.base_url or not self.secret:
            raise ErpIndisponivel("Integração com o ERP não configurada (ERP_INTERNAL_URL / RH_INTEGRATION_SECRET).")
        try:
            if files is not None:
                r = requests.request(metodo, self.base_url + caminho, headers=headers, files=files, timeout=self.timeout)
            else:
                r = requests.request(metodo, self.base_url + caminho, headers=headers, data=corpo or None, timeout=self.timeout)
        except requests.RequestException as e:
            raise ErpIndisponivel(str(e)) from e
        try:
            body = r.json()
        except ValueError:
            body = {}
        if r.status_code >= 500:
            raise ErpIndisponivel(f"ERP respondeu {r.status_code}: {body.get('code', '')}")
        if r.status_code >= 400:
            raise ErpErro(body.get("code") or "ERP_ERRO", body.get("error") or "O ERP recusou o pedido.", r.status_code)
        return body

    def _json(self, metodo: str, caminho: str, corpo: dict | None = None, ator: str | None = None, corpo_inteiro: bool = False):
        raw = json.dumps(corpo, ensure_ascii=False, separators=(",", ":")).encode("utf-8") if corpo is not None else b""
        headers = self._cabecalhos(metodo, caminho, sha256hex(raw), ator)
        if corpo is not None:
            headers["Content-Type"] = "application/json"
        body = self._enviar(metodo, caminho, corpo=raw, headers=headers)
        return body if corpo_inteiro else body.get("data")

    # lista pública (com cache e "última lista conhecida")
    def vagas_publicas(self) -> list[ErpVaga]:
        dados = cache.get(CACHE_PUBLICAS)
        if dados is None:
            try:
                dados = self._json("GET", "/api/rh/integracao/vagas/publicas") or []
                cache.set(CACHE_PUBLICAS, dados, CACHE_SEGUNDOS)
                cache.set(CACHE_ULTIMA, dados, None)
            except (ErpIndisponivel, ErpErro) as e:
                logger.warning("ERP indisponível para a lista pública de vagas: %s", e)
                dados = cache.get(CACHE_ULTIMA) or []
        return [erp_para_job(v) for v in dados]

    def vaga_publica(self, vaga_id: str) -> ErpVaga | None:
        return next((v for v in self.vagas_publicas() if v.pk == str(vaga_id)), None)

    # Painel RH do site (agindo como o usuário do ERP com o mesmo e-mail)
    def listar_vagas(self, ator: str, situacao: str | None = None) -> list[ErpVaga]:
        caminho = "/api/rh/integracao/vagas" + (f"?{urlencode({'situacao': situacao})}" if situacao else "")
        return [erp_para_job(v) for v in (self._json("GET", caminho, ator=ator) or [])]

    def obter_vaga(self, vaga_id: str, ator: str) -> ErpVaga:
        return erp_para_job(self._json("GET", f"/api/rh/integracao/vagas/{vaga_id}", ator=ator))

    def criar_vaga(self, dados: dict, ator: str) -> ErpVaga:
        return self.importar_vaga(dados, ator)[0]

    def importar_vaga(self, dados: dict, ator: str) -> tuple[ErpVaga, bool]:
        """Cria a vaga; com `origem_ref` já existente o ERP devolve a mesma vaga (existente=True)."""
        body = self._json("POST", "/api/rh/integracao/vagas", dados, ator=ator, corpo_inteiro=True)
        return erp_para_job(body.get("data")), bool(body.get("existente"))

    def editar_vaga(self, vaga_id: str, dados: dict, ator: str) -> ErpVaga:
        return erp_para_job(self._json("PATCH", f"/api/rh/integracao/vagas/{vaga_id}", dados, ator=ator))

    def acao_vaga(self, vaga_id: str, acao: str, ator: str, motivo: str | None = None) -> ErpVaga:
        corpo = {"acao": acao}
        if motivo:
            corpo["motivo"] = motivo
        return erp_para_job(self._json("POST", f"/api/rh/integracao/vagas/{vaga_id}/acao", corpo, ator=ator))

    def duplicar_vaga(self, vaga_id: str, ator: str) -> ErpVaga:
        return erp_para_job(self._json("POST", f"/api/rh/integracao/vagas/{vaga_id}/duplicar", {}, ator=ator))

    # candidatura (idempotente pela chave)
    def enviar_candidatura(self, dados: dict, arquivo: bytes | None, nome: str, chave: str) -> str:
        caminho = "/api/rh/integracao/candidaturas"
        dados_json = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
        headers = self._cabecalhos("POST", caminho, sha256hex(dados_json + "\n" + sha256hex(arquivo or b"")), chave=chave)
        # sempre multipart (o ERP lê com multer), mesmo sem arquivo
        files = {"dados": (None, dados_json.encode("utf-8"))}
        if arquivo:
            files["curriculo"] = (nome or "curriculo", arquivo, "application/octet-stream")
        body = self._enviar("POST", caminho, headers=headers, files=files)
        return body["data"]["id"]


def limpar_cache_vagas() -> None:
    cache.delete(CACHE_PUBLICAS)
