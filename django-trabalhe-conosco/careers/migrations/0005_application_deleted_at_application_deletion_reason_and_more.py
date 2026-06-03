from django.db import migrations, models
from django.utils import timezone
from datetime import timedelta


def populate_retention_until(apps, schema_editor):
    Application = apps.get_model("careers", "Application")
    for application in Application.objects.filter(retention_until__isnull=True).only("id", "created_at").iterator():
        application.retention_until = (application.created_at or timezone.now()) + timedelta(days=30)
        application.save(update_fields=["retention_until"])


class Migration(migrations.Migration):

    dependencies = [
        ('careers', '0004_rename_careers_app_job_date_idx_careers_app_job_id_17123a_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='application',
            name='deleted_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='Anonimizada em'),
        ),
        migrations.AddField(
            model_name='application',
            name='deletion_reason',
            field=models.CharField(blank=True, max_length=120, verbose_name='Motivo da anonimização'),
        ),
        migrations.AddField(
            model_name='application',
            name='resume_deleted_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Curriculo removido em'),
        ),
        migrations.AddField(
            model_name='application',
            name='retention_until',
            field=models.DateTimeField(blank=True, db_index=True, null=True, verbose_name='Reter dados ate'),
        ),
        migrations.AddIndex(
            model_name='application',
            index=models.Index(fields=['retention_until', 'deleted_at'], name='careers_app_retenti_81f270_idx'),
        ),
        migrations.RunPython(populate_retention_until, migrations.RunPython.noop),
    ]
