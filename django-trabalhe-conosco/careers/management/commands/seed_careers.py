from django.core.management.base import BaseCommand

from careers.models import Job


class Command(BaseCommand):
    help = "Cria vagas iniciais da Renostter para QA e demonstracao."

    def handle(self, *args, **options):
        jobs = [
            {
                "title": "Tecnico de Manutencao de Ar-Condicionado",
                "description": "Atendimento tecnico em campo para instalacao, manutencao preventiva/corretiva e higienizacao.",
                "requirements": "Experiencia com split hi-wall\nConhecimento basico em eletrica\nCNH sera diferencial",
                "benefits": "Treinamento tecnico\nPossibilidade de crescimento\nEquipe experiente",
                "location": "Sao Paulo/SP",
                "modality": Job.Modality.PRESENCIAL,
                "contract_type": Job.ContractType.PJ,
                "compensation_type": Job.CompensationType.A_COMBINAR,
                "area": "Operacoes",
                "area_owner": "Operacoes",
                "status": Job.Status.PUBLICADA,
                "approval_status": Job.ApprovalStatus.APROVADA,
            },
            {
                "title": "Auxiliar Tecnico",
                "description": "Apoio aos tecnicos em campo, organizacao de ferramentas e preparacao de materiais.",
                "requirements": "Organizacao\nPontualidade\nVontade de aprender",
                "benefits": "Formacao pratica\nPlano de evolucao",
                "location": "Sao Paulo/SP",
                "modality": Job.Modality.PRESENCIAL,
                "contract_type": Job.ContractType.CLT,
                "compensation_type": Job.CompensationType.A_COMBINAR,
                "area": "Operacoes",
                "area_owner": "Operacoes",
                "status": Job.Status.PUBLICADA,
                "approval_status": Job.ApprovalStatus.APROVADA,
            },
        ]
        for payload in jobs:
            Job.objects.update_or_create(title=payload["title"], defaults=payload)
        self.stdout.write(self.style.SUCCESS("Vagas iniciais criadas/atualizadas."))
