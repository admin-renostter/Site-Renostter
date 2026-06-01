from django.conf import settings
from django.core.mail import EmailMessage, send_mail
from django.template.loader import render_to_string

from .models import Application
from .services.audit import audit_event
from .services.resume_index import index_application_resume
from .services.resume_parser import extract_resume_text
from .services.screening import score_application


def process_application(application_id: int) -> None:
    application = Application.objects.select_related("job").get(pk=application_id)

    resume_text = extract_resume_text(application.resume.path)
    score = score_application(application.job, application, resume_text)

    Application.objects.filter(pk=application.pk).update(resume_text=resume_text[:20000], qa_score=score)
    index_application_resume(application.pk, resume_text)
    audit_event("application_received", {"application_id": application.pk, "job_id": application.job_id, "score": score})
    send_application_emails(application)


def send_application_emails(application: Application) -> None:
    candidate_body = render_to_string("careers/emails/candidate_confirmation.html", {"application": application})
    send_mail(
        subject="Recebemos sua candidatura - Renostter",
        message="Recebemos sua candidatura. Em breve nosso time analisara seu perfil.",
        html_message=candidate_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[application.email],
        fail_silently=False,
    )

    rh_body = render_to_string("careers/emails/rh_notification.html", {"application": application})
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
