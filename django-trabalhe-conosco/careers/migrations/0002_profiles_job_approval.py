from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_existing_jobs(apps, schema_editor):
    Job = apps.get_model("careers", "Job")
    for job in Job.objects.all():
        if not job.area_owner:
            job.area_owner = job.area or ""
        if job.status == "aberta":
            job.status = "publicada"
            job.approval_status = "aprovada"
            job.published_at = job.created_at
            job.approved_at = job.created_at
        job.save()


def create_staff_profiles(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("careers", "UserProfile")
    for user in User.objects.filter(is_staff=True):
        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                "role": "master" if user.is_superuser else "recrutador_area",
                "area": "",
                "must_change_password": False,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("careers", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("master", "Master"), ("gestor_area", "Gestor de area"), ("recrutador_area", "Recrutador de area"), ("visualizador", "Visualizador")], db_index=True, default="recrutador_area", max_length=30, verbose_name="Perfil")),
                ("area", models.CharField(blank=True, db_index=True, max_length=100, verbose_name="Area")),
                ("must_change_password", models.BooleanField(default=True, verbose_name="Troca de senha obrigatoria")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criado em")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Atualizado em")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="career_profile", to=settings.AUTH_USER_MODEL, verbose_name="Usuario")),
            ],
            options={"ordering": ["user__username"]},
        ),
        migrations.AlterField(
            model_name="job",
            name="status",
            field=models.CharField(choices=[("rascunho", "Rascunho"), ("em_aprovacao", "Em aprovacao"), ("ajustes_solicitados", "Ajustes solicitados"), ("publicada", "Publicada"), ("aberta", "Aberta"), ("pausada", "Pausada"), ("preenchida", "Preenchida"), ("rejeitada", "Rejeitada"), ("arquivada", "Arquivada")], db_index=True, default="rascunho", max_length=30, verbose_name="Status"),
        ),
        migrations.AddField(
            model_name="job",
            name="approval_status",
            field=models.CharField(choices=[("rascunho", "Rascunho"), ("pendente", "Pendente"), ("ajustes", "Ajustes solicitados"), ("aprovada", "Aprovada"), ("rejeitada", "Rejeitada")], db_index=True, default="rascunho", max_length=30, verbose_name="Status de aprovacao"),
        ),
        migrations.AddField(
            model_name="job",
            name="area_owner",
            field=models.CharField(blank=True, db_index=True, max_length=100, verbose_name="Area responsavel"),
        ),
        migrations.AddField(
            model_name="job",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Aprovada em"),
        ),
        migrations.AddField(
            model_name="job",
            name="approved_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_jobs", to=settings.AUTH_USER_MODEL, verbose_name="Aprovada por"),
        ),
        migrations.AddField(
            model_name="job",
            name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_jobs", to=settings.AUTH_USER_MODEL, verbose_name="Criada por"),
        ),
        migrations.AddField(
            model_name="job",
            name="internal_notes",
            field=models.TextField(blank=True, verbose_name="Notas internas"),
        ),
        migrations.AddField(
            model_name="job",
            name="published_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Publicada em"),
        ),
        migrations.AddField(
            model_name="job",
            name="rejection_reason",
            field=models.TextField(blank=True, verbose_name="Motivo/ajustes solicitados"),
        ),
        migrations.AddIndex(
            model_name="job",
            index=models.Index(fields=["approval_status", "status"], name="careers_job_approv_eb7a89_idx"),
        ),
        migrations.AddIndex(
            model_name="job",
            index=models.Index(fields=["area_owner", "status"], name="careers_job_area_own_302ab5_idx"),
        ),
        migrations.RunPython(migrate_existing_jobs, migrations.RunPython.noop),
        migrations.RunPython(create_staff_profiles, migrations.RunPython.noop),
    ]
