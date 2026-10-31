"""Leva as vagas e candidaturas do banco do site para o ERP (RH Fase 2).

Simulação por padrão (só mostra o que faria). Com --apply grava no ERP.
Pode rodar de novo: cada vaga leva origem_ref="site:<id>" e o ERP não duplica.
"""
from __future__ import annotations

from uuid import uuid4

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from careers.models import Application, Job
from careers.services.erp_client import ErpClient, ErpErro, ErpIndisponivel, job_para_erp

# situação do site → ações no ERP depois de criar (a vaga nasce em rascunho)
ACOES = {
    Job.Status.RASCUNHO: [],
    Job.Status.EM_APROVACAO: ["enviar"],
    Job.Status.AJUSTES: ["enviar", "pedir_ajustes"],
    Job.Status.PUBLICADA: ["enviar", "aprovar"],
    Job.Status.ABERTA: ["enviar", "aprovar"],
    Job.Status.PAUSADA: ["enviar", "aprovar", "pausar"],
    Job.Status.PREENCHIDA: ["enviar", "aprovar", "marcar_preenchida"],
    Job.Status.REJEITADA: ["enviar", "rejeitar"],
}
COM_MOTIVO = {"pedir_ajustes", "rejeitar"}
RESULTADO = {"enviar": "em_aprovacao", "aprovar": "aberta", "pedir_ajustes": "ajustes_solicitados", "rejeitar": "rejeitada",
             "pausar": "pausada", "marcar_preenchida": "preenchida", "encerrar": "encerrada"}


class Command(BaseCommand):
    help = "Exporta vagas (não arquivadas) e candidaturas dentro do prazo para o ERP. Simulação por padrão."

    def add_arguments(self, parser):
        parser.add_argument("--ator", required=True, help="E-mail de um admin do ERP (quem aparece na auditoria e aprova).")
        parser.add_argument("--apply", action="store_true", help="Grava no ERP (sem isso, só simula).")

    def handle(self, *args, **opts):
        ator, aplicar = opts["ator"].strip().lower(), opts["apply"]
        client = ErpClient()
        hoje = timezone.localdate()
        mapa: dict[int, tuple[str, str]] = {}  # job.pk → (id no ERP, situação no ERP)
        self.stdout.write(("GRAVANDO no ERP" if aplicar else "SIMULAÇÃO (nada é gravado; use --apply)") + f" — ator {ator}")

        for job in Job.objects.exclude(status=Job.Status.ARQUIVADA).order_by("created_at"):
            acoes = list(ACOES.get(job.status, []))
            vencida = bool(job.expires_at and job.expires_at < hoje)
            if vencida and "aprovar" in acoes:
                acoes = ["enviar", "aprovar", "encerrar"]
            dados = job_para_erp({f: getattr(job, f) for f in ["title", "description", "requirements", "benefits", "location",
                                                                "modality", "contract_type", "compensation_type", "compensation_value", "area"]})
            if job.expires_at and not vencida:
                dados["expira_em"] = job.expires_at.isoformat()
            dados["origem_ref"] = f"site:{job.pk}"
            self.stdout.write(f"- vaga #{job.pk} {job.title!r} ({job.status}) → criar{' + ' + ', '.join(acoes) if acoes else ''}")
            if not aplicar:
                continue
            try:
                vaga, existente = client.importar_vaga(dados, ator)
                # rodar de novo depois de uma falha: continua a partir da situação em que a vaga ficou
                estados = ["rascunho"] + [RESULTADO[a] for a in acoes]
                faltam = acoes[estados.index(vaga.status):] if vaga.status in estados else []
                for acao in faltam:
                    motivo = (job.rejection_reason or "Migrado do site de Carreiras.") if acao in COM_MOTIVO else None
                    vaga = client.acao_vaga(vaga.pk, acao, ator, motivo=motivo)
                self.stdout.write(f"  {'já estava' if existente else 'criada'} no ERP: {vaga.pk} ({vaga.status})")
                mapa[job.pk] = (vaga.pk, vaga.status)
            except (ErpErro, ErpIndisponivel) as e:
                raise CommandError(f"Vaga #{job.pk}: {e}") from e

        pendentes = Application.objects.filter(job__isnull=False, deleted_at__isnull=True, erp_status="").order_by("created_at")
        for app in pendentes:
            destino = mapa.get(app.job_id)
            if not aplicar:
                self.stdout.write(f"- candidatura #{app.pk} (vaga #{app.job_id}) → entregar se a vaga estiver aberta no ERP")
                continue
            if not destino or destino[1] != "aberta":
                self.stdout.write(f"- candidatura #{app.pk}: vaga não está aberta no ERP; fica no site até o prazo LGPD")
                continue
            Application.objects.filter(pk=app.pk).update(erp_vaga_id=destino[0], erp_vaga_titulo=app.job.title[:150],
                                                         erp_status=Application.ErpStatus.PENDENTE, erp_chave=uuid4())
            from careers.tasks import entregar_ao_erp
            resultado = entregar_ao_erp(app.pk, enviar_email=False)
            self.stdout.write(f"- candidatura #{app.pk} → {resultado}")
        self.stdout.write(self.style.SUCCESS("Concluído."))
