import logging

from django.conf import settings
from django.core.mail import EmailMessage, send_mail
from django.template.loader import render_to_string
import requests

from .models import Application
from .services.audit import audit_event
from .services.resume_index import index_application_resume
from .services.resume_parser import extract_resume_text
from .services.screening import score_application
from .services.storage import StorageNotConfigured, create_signed_resume_url, upload_resume_to_supabase

logger = logging.getLogger(__name__)


def process_application(application_id: int) -> None:
    application = Application.objects.select_related("job").get(pk=application_id)

    if not application.resume_storage_key:
        try:
            stored_file = upload_resume_to_supabase(application)
            Application.objects.filter(pk=application.pk).update(resume_storage_key=stored_file.key)
            application.resume_storage_key = stored_file.key
        except StorageNotConfigured:
            pass
        except Exception:
            logger.exception("Falha ao enviar curriculo da candidatura %s para o storage.", application.pk)

    resume_text = extract_resume_text(application.resume.path)
    score = score_application(application.job, application, resume_text)

    Application.objects.filter(pk=application.pk).update(resume_text=resume_text[:20000], qa_score=score)
    index_application_resume(application.pk, resume_text)
    audit_event("application_received", {"application_id": application.pk, "job_id": application.job_id, "score": score})


def send_application_emails(application: Application) -> None:
    candidate_body = render_to_string("careers/emails/candidate_confirmation.html", {"application": application})
    _send_email(
        subject="Recebemos sua candidatura - Renostter",
        html=candidate_body,
        recipients=[application.email],
        text="Recebemos sua candidatura. Em breve nosso time analisara seu perfil.",
    )

    rh_body = render_to_string("careers/emails/rh_notification.html", {"application": application})
    if settings.RESEND_API_KEY:
        signed_url = ""
        if application.resume_storage_key:
            try:
                signed_url = create_signed_resume_url(application.resume_storage_key)
            except Exception:
                signed_url = ""
        if signed_url:
            rh_body = f"{rh_body}<p><a href='{signed_url}'>Baixar curriculo</a></p>"
        _send_email(
            subject=f"Nova candidatura: {application.name} - {application.job.title}",
            html=rh_body,
            recipients=[settings.RH_EMAIL],
            text=f"Nova candidatura para {application.job.title}. Acesse o Painel RH para ver detalhes.",
        )
        return

    email = EmailMessage(
        subject=f"Nova candidatura: {application.name} - {application.job.title}",
        body=rh_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[settings.RH_EMAIL],
    )
    email.content_subtype = "html"
    if application.resume:
        email.attach_file(application.resume.path)
    email.send(fail_silently=False)


def _send_email(subject: str, html: str, recipients: list[str], text: str = "") -> None:
    if not settings.RESEND_API_KEY:
        send_mail(
            subject=subject,
            message=text or subject,
            html_message=html,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
        return

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": settings.DEFAULT_FROM_EMAIL,
            "to": recipients,
            "subject": subject,
            "html": html,
            "text": text or subject,
        },
        timeout=20,
    )
    response.raise_for_status()
