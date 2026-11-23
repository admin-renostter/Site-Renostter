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

    try:
        resume_text = extract_resume_text(application.resume.path)
    except (OSError, ValueError):
        logger.warning("Curriculo local indisponivel para processamento da candidatura %s.", application.pk)
        resume_text = ""

    if not resume_text:
        audit_event(
            "application_received",
            {"application_id": application.pk, "job_id": application.job_id, "score": application.qa_score, "resume_text": "unavailable"},
        )
        return

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


# ───────────────────────── RH Fase 2: entrega ao ERP ─────────────────────────
# Retentativas: 1, 5, 15 e 60 min; depois de 6 em 6 h até 3 dias da candidatura.
ATRASOS_MIN = [1, 5, 15, 60]
ATRASO_LONGO_MIN = 360
PRAZO_ENTREGA_DIAS = 3
CONSENTIMENTO_VERSAO = "2026-10"


def _proximo_atraso(tentativas: int) -> int:
    return ATRASOS_MIN[tentativas - 1] if tentativas <= len(ATRASOS_MIN) else ATRASO_LONGO_MIN


def _ler_curriculo(application: Application) -> bytes | None:
    """Bytes do currículo. Se havia currículo e não deu para ler, lança (a entrega é tentada de novo)."""
    if application.resume:
        try:
            with application.resume.open("rb") as f:
                return f.read()
        except OSError:
            logger.warning("Curriculo local indisponivel para a candidatura %s.", application.pk)
    if application.resume_storage_key:
        from .services.storage import download_resume_from_supabase
        return download_resume_from_supabase(application.resume_storage_key).content
    if application.resume:
        raise OSError(f"curriculo da candidatura {application.pk} nao encontrado")
    return None


def _apagar_copia_local(application: Application, motivo: str) -> None:
    """Depois que o ERP tem a candidatura (ou ela foi recusada), o site não guarda cópia."""
    from django.utils import timezone
    from .services.storage import StorageNotConfigured, delete_resume_from_supabase

    if application.resume_storage_key:
        try:
            delete_resume_from_supabase(application.resume_storage_key)
        except StorageNotConfigured:
            pass
        except Exception:
            logger.exception("Falha ao apagar o curriculo da candidatura %s no storage.", application.pk)
    if application.resume:
        try:
            application.resume.delete(save=False)
        except OSError:
            pass
    agora = timezone.now()
    Application.objects.filter(pk=application.pk).update(
        name=f"Candidatura #{application.pk}", email=f"deleted+{application.pk}@lgpd.local", phone="",
        message="", resume="", resume_text="", resume_storage_key="", resume_original_name="", qa_score=0,
        deleted_at=agora, resume_deleted_at=agora, deletion_reason=motivo,
    )


def _reagendar(application: Application, erro: str, enviar_email: bool = True) -> None:
    from datetime import timedelta
    from django.utils import timezone
    from django_q.models import Schedule
    from django_q.tasks import schedule

    tentativas = application.erp_tentativas + 1
    limite = application.created_at + timedelta(days=PRAZO_ENTREGA_DIAS)
    proxima = timezone.now() + timedelta(minutes=_proximo_atraso(tentativas))
    if proxima > limite:
        Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.FALHOU, erp_tentativas=tentativas, erp_erro=erro[:300])
        _avisar_responsavel(application, erro)
        return
    Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.PENDENTE, erp_tentativas=tentativas, erp_erro=erro[:300])
    schedule("careers.tasks.entregar_ao_erp", application.pk, schedule_type=Schedule.ONCE, next_run=proxima,
             name=f"entregar-erp-{application.pk}-{tentativas}", **({} if enviar_email else {"enviar_email": False}))


def _avisar_responsavel(application: Application, erro: str) -> None:
    try:
        _send_email(
            subject=f"Candidatura #{application.pk} nao chegou ao ERP",
            html=(f"<p>A candidatura #{application.pk} para <strong>{application.vaga_titulo}</strong> nao pode ser entregue ao ERP.</p>"
                  f"<p>Ultimo erro: {erro}</p><p>Os dados continuam no Painel RH do site ate o prazo de retencao.</p>"),
            recipients=[settings.RH_EMAIL],
            text=f"A candidatura #{application.pk} nao pode ser entregue ao ERP. Ultimo erro: {erro}",
        )
    except Exception:
        logger.exception("Falha ao avisar o responsavel sobre a candidatura %s.", application.pk)


def _avisar_vaga_fechada(application: Application) -> None:
    try:
        _send_email(
            subject="Sobre sua candidatura - Renostter",
            html=(f"<p>Ola, {application.name}.</p><p>A vaga <strong>{application.vaga_titulo}</strong> foi encerrada antes de "
                  "recebermos sua candidatura, por isso ela nao seguiu no processo. Fique de olho em novas vagas em "
                  "<a href='https://carreiras.renostter.com/trabalhe-conosco/'>carreiras.renostter.com</a>.</p>"),
            recipients=[application.email],
            text=f"A vaga {application.vaga_titulo} foi encerrada antes de recebermos sua candidatura.",
        )
    except Exception:
        logger.exception("Falha ao avisar o candidato da candidatura %s.", application.pk)


# Recusas do ERP que valem nova tentativa (relógio, segredo trocado, gravação em andamento, limite de taxa)
RETENTAVEIS = {"RH_ASSINATURA_EXPIRADA", "RH_ASSINATURA_INVALIDA", "RH_ASSINATURA_REPETIDA", "RH_EM_PROCESSAMENTO"}


def entregar_ao_erp(application_id: int, enviar_email: bool = True) -> str:
    """Envia a candidatura ao ERP. Idempotente: o ERP reconhece reenvios pela `erp_chave`."""
    from django.utils import timezone
    from .services.erp_client import ErpClient, ErpErro, ErpIndisponivel

    # "pega" a candidatura: duas execuções ao mesmo tempo não enviam a mesma
    pegou = Application.objects.filter(pk=application_id, erp_status=Application.ErpStatus.PENDENTE).update(
        erp_status=Application.ErpStatus.ENVIANDO, erp_ultima_tentativa=timezone.now())
    if not pegou:
        return "ignorada"
    application = Application.objects.get(pk=application_id)
    try:
        arquivo = _ler_curriculo(application)
        texto = ""
        if application.resume:
            try:
                texto = extract_resume_text(application.resume.path)
            except (OSError, ValueError, NotImplementedError):
                texto = ""
            if texto.startswith("[docling_unavailable]"):
                texto = ""
        dados = {
            "vaga_id": application.erp_vaga_id, "nome": application.name, "email": application.email,
            "telefone": application.phone, "mensagem": application.message,
            "banco_talentos": application.banco_talentos,
            "consentimento_versao": CONSENTIMENTO_VERSAO if application.banco_talentos else None,
            "curriculo_texto": (texto or "")[:20000], "origem_ref": f"site:app:{application.pk}",
        }
        if not enviar_email:
            dados["enviar_email"] = False
        erp_id = ErpClient().enviar_candidatura(dados, arquivo, application.resume_original_name or "curriculo", str(application.erp_chave))
    except ErpIndisponivel as e:
        _reagendar(application, str(e), enviar_email)
        return "reagendada"
    except ErpErro as e:
        if e.code in RETENTAVEIS or e.status in (401, 408, 429):
            _reagendar(application, f"{e.code}: {e.mensagem}", enviar_email)
            return "reagendada"
        if e.code == "RH_CANDIDATURA_DUPLICADA":
            # a pessoa já está nessa vaga no ERP: nada a entregar
            Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.ENTREGUE, erp_erro="Ja estava na vaga")
            _apagar_copia_local(application, "entregue_ao_erp")
            return "entregue"
        if e.code == "RH_VAGA_FECHADA":
            Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.RECUSADA, erp_erro=e.mensagem[:300])
            _avisar_vaga_fechada(application)
            _apagar_copia_local(application, "vaga_fechada")
            return "recusada"
        # demais recusas (vaga não encontrada, arquivo inválido...): guarda os dados e avisa o RH
        Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.FALHOU, erp_erro=f"{e.code}: {e.mensagem}"[:300])
        _avisar_responsavel(application, f"{e.code}: {e.mensagem}")
        return "falhou"
    except Exception as e:  # erro inesperado (ex.: storage): tenta de novo mais tarde
        logger.exception("Falha ao entregar a candidatura %s ao ERP.", application.pk)
        _reagendar(application, f"{type(e).__name__}: {e}", enviar_email)
        return "reagendada"
    Application.objects.filter(pk=application.pk).update(erp_status=Application.ErpStatus.ENTREGUE, erp_id=erp_id, erp_erro="")
    _apagar_copia_local(application, "entregue_ao_erp")
    audit_event("application_delivered_to_erp", {"application_id": application.pk, "erp_id": erp_id})
    return "entregue"


def reenfileirar_pendentes() -> int:
    """Rede de segurança (a cada 30 min): candidaturas paradas em "pendente"/"enviando" voltam para a fila.

    Cobre agendamento que falhou, worker reiniciado no meio do envio e migração interrompida.
    """
    from datetime import timedelta
    from django.db.models import Q
    from django.utils import timezone
    from django_q.tasks import async_task

    agora = timezone.now()
    paradas = Application.objects.filter(
        Q(erp_status=Application.ErpStatus.PENDENTE, created_at__lte=agora - timedelta(minutes=10))
        & (Q(erp_ultima_tentativa__isnull=True) | Q(erp_ultima_tentativa__lte=agora - timedelta(hours=7)))
        | Q(erp_status=Application.ErpStatus.ENVIANDO, erp_ultima_tentativa__lte=agora - timedelta(minutes=30))
    )
    n = 0
    for pk in paradas.values_list("pk", flat=True):
        Application.objects.filter(pk=pk, erp_status=Application.ErpStatus.ENVIANDO).update(erp_status=Application.ErpStatus.PENDENTE)
        async_task("careers.tasks.entregar_ao_erp", pk)
        n += 1
    return n


def garantir_reenfileiramento() -> None:
    """Cria (uma vez) o agendamento de reenfileirar_pendentes no django-q."""
    try:
        from django_q.models import Schedule
        Schedule.objects.get_or_create(
            name="rh-reenfileirar-pendentes",
            defaults={"func": "careers.tasks.reenfileirar_pendentes", "schedule_type": Schedule.MINUTES, "minutes": 30, "repeats": -1},
        )
    except Exception:
        logger.exception("Nao foi possivel criar o agendamento de reenvio ao ERP.")
