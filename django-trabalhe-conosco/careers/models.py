from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.urls import reverse
from django.utils import timezone


class UserProfile(models.Model):
    class Role(models.TextChoices):
        MASTER = "master", "Master"
        GESTOR_AREA = "gestor_area", "Gestor de area"
        RECRUTADOR_AREA = "recrutador_area", "Recrutador de area"
        VISUALIZADOR = "visualizador", "Visualizador"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, verbose_name="Usuario", on_delete=models.CASCADE, related_name="career_profile")
    role = models.CharField("Perfil", max_length=30, choices=Role.choices, default=Role.RECRUTADOR_AREA, db_index=True)
    area = models.CharField("Area", max_length=100, blank=True, db_index=True)
    must_change_password = models.BooleanField("Troca de senha obrigatoria", default=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ["user__username"]

    def __str__(self) -> str:
        return f"{self.user} - {self.get_role_display()}"

    @property
    def is_master(self) -> bool:
        return self.role == self.Role.MASTER


class Job(models.Model):
    class ContractType(models.TextChoices):
        CLT = "CLT", "CLT"
        PJ = "PJ", "PJ"
        ESTAGIO = "Estagio", "Estagio"
        FREELANCER = "Freelancer", "Freelancer"

    class Status(models.TextChoices):
        RASCUNHO = "rascunho", "Rascunho"
        EM_APROVACAO = "em_aprovacao", "Em aprovacao"
        AJUSTES = "ajustes_solicitados", "Ajustes solicitados"
        PUBLICADA = "publicada", "Publicada"
        ABERTA = "aberta", "Aberta"
        PAUSADA = "pausada", "Pausada"
        PREENCHIDA = "preenchida", "Preenchida"
        REJEITADA = "rejeitada", "Rejeitada"
        ARQUIVADA = "arquivada", "Arquivada"

    class ApprovalStatus(models.TextChoices):
        RASCUNHO = "rascunho", "Rascunho"
        PENDENTE = "pendente", "Pendente"
        AJUSTES = "ajustes", "Ajustes solicitados"
        APROVADA = "aprovada", "Aprovada"
        REJEITADA = "rejeitada", "Rejeitada"

    class Modality(models.TextChoices):
        PRESENCIAL = "Presencial", "Presencial"
        REMOTO = "Remoto", "Remoto"
        HIBRIDO = "Hibrido", "Hibrido"

    title = models.CharField("Titulo", max_length=150, db_index=True)
    description = models.TextField("Descricao")
    requirements = models.TextField("Requisitos", blank=True)
    benefits = models.TextField("Beneficios", blank=True)
    location = models.CharField("Localidade", max_length=100, db_index=True)
    modality = models.CharField("Modalidade", max_length=20, choices=Modality.choices, default=Modality.PRESENCIAL)
    contract_type = models.CharField("Tipo de contrato", max_length=20, choices=ContractType.choices, db_index=True)
    area = models.CharField("Area", max_length=100, blank=True, db_index=True)
    status = models.CharField("Status", max_length=30, choices=Status.choices, default=Status.RASCUNHO, db_index=True)
    approval_status = models.CharField("Status de aprovacao", max_length=30, choices=ApprovalStatus.choices, default=ApprovalStatus.RASCUNHO, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Criada por", on_delete=models.SET_NULL, null=True, blank=True, related_name="created_jobs")
    area_owner = models.CharField("Area responsavel", max_length=100, blank=True, db_index=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="Aprovada por", on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_jobs")
    approved_at = models.DateTimeField("Aprovada em", null=True, blank=True)
    published_at = models.DateTimeField("Publicada em", null=True, blank=True)
    rejection_reason = models.TextField("Motivo/ajustes solicitados", blank=True)
    internal_notes = models.TextField("Notas internas", blank=True)
    expires_at = models.DateField("Data de expiracao", null=True, blank=True)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "expires_at"]),
            models.Index(fields=["approval_status", "status"]),
            models.Index(fields=["area", "contract_type", "modality"]),
            models.Index(fields=["area_owner", "status"]),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def is_open(self) -> bool:
        return self.status == self.Status.PUBLICADA and self.approval_status == self.ApprovalStatus.APROVADA and (self.expires_at is None or self.expires_at >= timezone.localdate())

    def get_absolute_url(self):
        return f"{reverse('careers:apply')}?vaga={self.pk}"


def resume_upload_path(instance, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return f"curriculos/vaga-{instance.job_id}/{timezone.now():%Y/%m}/{uuid4().hex}{suffix}"


class Application(models.Model):
    job = models.ForeignKey(Job, verbose_name="Vaga", on_delete=models.CASCADE, related_name="applications")
    name = models.CharField("Nome", max_length=100)
    email = models.EmailField("E-mail", db_index=True)
    phone = models.CharField("Telefone", max_length=20, blank=True)
    message = models.TextField("Mensagem", blank=True)
    resume = models.FileField(
        "Curriculo",
        upload_to=resume_upload_path,
        validators=[FileExtensionValidator(["pdf", "doc", "docx"])],
    )
    resume_text = models.TextField("Texto extraido", blank=True)
    resume_storage_key = models.CharField("Chave do curriculo no storage", max_length=500, blank=True)
    resume_original_name = models.CharField("Nome original do curriculo", max_length=255, blank=True)
    qa_score = models.FloatField("Score QA", default=0)
    created_at = models.DateTimeField("Data da candidatura", auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["job", "created_at"]),
            models.Index(fields=["email", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} - {self.job}"

    @property
    def resume_url(self) -> str:
        if settings.DEBUG and self.resume:
            return self.resume.url
        return self.resume.name
