from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("careers", "0002_profiles_job_approval"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="resume_original_name",
            field=models.CharField(blank=True, max_length=255, verbose_name="Nome original do curriculo"),
        ),
        migrations.AddField(
            model_name="application",
            name="resume_storage_key",
            field=models.CharField(blank=True, max_length=500, verbose_name="Chave do curriculo no storage"),
        ),
    ]
