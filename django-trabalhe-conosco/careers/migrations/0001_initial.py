# Generated for the Renostter careers app.

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models

import careers.models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Job",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(db_index=True, max_length=150, verbose_name="Titulo")),
                ("description", models.TextField(verbose_name="Descricao")),
                ("requirements", models.TextField(blank=True, verbose_name="Requisitos")),
                ("benefits", models.TextField(blank=True, verbose_name="Beneficios")),
                ("location", models.CharField(db_index=True, max_length=100, verbose_name="Localidade")),
                ("modality", models.CharField(choices=[("Presencial", "Presencial"), ("Remoto", "Remoto"), ("Hibrido", "Hibrido")], default="Presencial", max_length=20, verbose_name="Modalidade")),
                ("contract_type", models.CharField(choices=[("CLT", "CLT"), ("PJ", "PJ"), ("Estagio", "Estagio"), ("Freelancer", "Freelancer")], db_index=True, max_length=20, verbose_name="Tipo de contrato")),
                ("area", models.CharField(blank=True, db_index=True, max_length=100, verbose_name="Area")),
                ("status", models.CharField(choices=[("aberta", "Aberta"), ("pausada", "Pausada"), ("preenchida", "Preenchida")], db_index=True, default="aberta", max_length=20, verbose_name="Status")),
                ("expires_at", models.DateField(blank=True, null=True, verbose_name="Data de expiracao")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criada em")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Atualizada em")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="Application",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, verbose_name="Nome")),
                ("email", models.EmailField(db_index=True, max_length=254, verbose_name="E-mail")),
                ("phone", models.CharField(blank=True, max_length=20, verbose_name="Telefone")),
                ("message", models.TextField(blank=True, verbose_name="Mensagem")),
                ("resume", models.FileField(upload_to=careers.models.resume_upload_path, validators=[django.core.validators.FileExtensionValidator(["pdf", "doc", "docx"])], verbose_name="Curriculo")),
                ("resume_text", models.TextField(blank=True, verbose_name="Texto extraido")),
                ("qa_score", models.FloatField(default=0, verbose_name="Score QA")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="Data da candidatura")),
                ("job", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="applications", to="careers.job", verbose_name="Vaga")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddIndex(model_name="job", index=models.Index(fields=["status", "expires_at"], name="careers_job_status_exp_idx")),
        migrations.AddIndex(model_name="job", index=models.Index(fields=["area", "contract_type", "modality"], name="careers_job_filters_idx")),
        migrations.AddIndex(model_name="application", index=models.Index(fields=["job", "created_at"], name="careers_app_job_date_idx")),
        migrations.AddIndex(model_name="application", index=models.Index(fields=["email", "created_at"], name="careers_app_email_date_idx")),
    ]
