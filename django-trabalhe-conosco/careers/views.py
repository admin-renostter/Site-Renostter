import logging
import mimetypes
from uuid import uuid4

from django.conf import settings

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView, PasswordResetView
from django.core.cache import cache
from django.db import connection
from django.db.models import Q
from django.http import FileResponse, HttpResponse, HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.views import View
from django.views.generic import CreateView, ListView
from django_q.tasks import async_task

from .forms import ApplicationForm, ErpJobForm, JobFilterForm, RecruiterAuthenticationForm, RecruiterPasswordResetForm, UserProfileForm
from .models import Application, UserProfile
from .services.storage import StorageNotConfigured, download_resume_from_supabase
from .services.storage import upload_resume_to_supabase

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def erp_vagas_mudaram(request):
    """O ERP avisa (assinado) que as vagas mudaram: limpa o cache da lista pública."""
    from .services.erp_client import limpar_cache_vagas, sha256hex, verificar_assinatura
    ok = verificar_assinatura(settings.RH_INTEGRATION_SECRET, request.headers.get("X-RH-Timestamp", ""),
                              request.headers.get("X-RH-Signature", ""), "POST", request.get_full_path(), sha256hex(request.body))
    if not ok:
        return JsonResponse({"success": False, "code": "RH_ASSINATURA_INVALIDA"}, status=401)
    limpar_cache_vagas()
    return HttpResponse(status=204)


def health_check(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return JsonResponse({"status": "ok"})


def _erp():
    from .services.erp_client import ErpClient
    return ErpClient()


def _filtrar_vagas(vagas, data):
    """Filtros da página pública aplicados sobre a lista que veio do ERP."""
    q = (data.get("q") or "").strip().lower()
    out = []
    for v in vagas:
        if q and q not in v.title.lower() and q not in v.description.lower():
            continue
        if data.get("area") and v.area.lower() != data["area"].strip().lower():
            continue
        if data.get("modality") and v.modality != data["modality"]:
            continue
        if data.get("contract_type") and v.contract_type != data["contract_type"]:
            continue
        out.append(v)
    return out


class JobListView(ListView):
    """Vagas abertas e não vencidas do ERP (cache de 60 s; última lista conhecida se o ERP cair)."""

    template_name = "careers/job_list.html"
    context_object_name = "jobs"
    paginate_by = 20

    def get_queryset(self):
        self.todas = [v for v in _erp().vagas_publicas() if v.is_open]
        form = JobFilterForm(self.request.GET)
        return _filtrar_vagas(self.todas, form.cleaned_data) if form.is_valid() else self.todas

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["filter_form"] = JobFilterForm(self.request.GET)
        ctx["areas"] = sorted({v.area for v in self.todas if v.area})
        return ctx


@method_decorator(csrf_exempt, name="dispatch")
class ApplicationCreateView(CreateView):
    model = Application
    form_class = ApplicationForm
    template_name = "careers/apply.html"
    success_url = reverse_lazy("careers:job_list")

    def dispatch(self, request, *args, **kwargs):
        if request.method == "POST" and _is_rate_limited(request, "candidate", limit=5, window_seconds=3600):
            messages.error(request, "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.")
            return redirect("careers:job_list")
        job_id = request.GET.get("vaga") or request.POST.get("vaga")
        if not job_id:
            messages.error(request, "Escolha uma vaga antes de enviar sua candidatura.")
            return redirect("careers:job_list")
        self.job = _erp().vaga_publica(job_id)
        if not self.job or not self.job.is_open:
            messages.error(request, "Esta vaga nao esta mais aberta.")
            return redirect("careers:job_list")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        # Grava localmente e entrega ao ERP por tarefa (com retentativa). O e-mail de
        # confirmação ao candidato sai do ERP; depois de entregue, a cópia local é apagada.
        form.instance.job = None
        form.instance.erp_vaga_id = self.job.pk
        form.instance.erp_vaga_titulo = self.job.title[:150]
        form.instance.erp_status = Application.ErpStatus.PENDENTE
        form.instance.erp_chave = uuid4()
        if form.instance.resume:
            form.instance.resume_original_name = form.instance.resume.name
        response = super().form_valid(form)
        if not self.object.retention_until:
            self.object.retention_until = self.object.lgpd_retention_deadline
            Application.objects.filter(pk=self.object.pk).update(retention_until=self.object.retention_until)
        try:
            async_task("careers.tasks.entregar_ao_erp", self.object.pk)
        except Exception:
            logger.exception("Falha ao agendar a entrega da candidatura %s ao ERP", self.object.pk)
        from .tasks import garantir_reenfileiramento
        garantir_reenfileiramento()  # rede de segurança: reenvia o que ficar parado
        messages.success(
            self.request,
            "Seu curriculo foi recebido com sucesso. Nossa equipe avaliara suas informacoes e, caso haja aderencia com a vaga, a Renostter entrara em contato para as proximas etapas.",
            extra_tags="application-success",
        )
        return response

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["job"] = self.job
        ctx["erp_public_url"] = settings.ERP_PUBLIC_URL
        return ctx


class RecruiterLoginView(LoginView):
    template_name = "careers/admin_login.html"
    authentication_form = RecruiterAuthenticationForm
    redirect_authenticated_user = True

    def dispatch(self, request, *args, **kwargs):
        if request.method == "POST" and _is_rate_limited(request, "login", limit=8, window_seconds=900):
            messages.error(request, "Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.")
            return HttpResponseForbidden("Too many login attempts.")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        if form.cleaned_data.get("remember_me"):
            self.request.session.set_expiry(60 * 60 * 24 * 30)
        else:
            self.request.session.set_expiry(0)
        messages.success(self.request, "Login realizado com sucesso.")
        return response


class RecruiterPasswordResetView(PasswordResetView):
    template_name = "careers/password_reset.html"
    email_template_name = "careers/emails/password_reset_email.html"
    subject_template_name = "careers/emails/password_reset_subject.txt"
    form_class = RecruiterPasswordResetForm
    success_url = "/admin/recuperar-senha/enviado/"

    def dispatch(self, request, *args, **kwargs):
        if request.method == "POST" and _is_rate_limited(request, "password-reset", limit=3, window_seconds=3600):
            messages.error(request, "Muitas solicitacoes de recuperacao. Tente novamente mais tarde.")
            return HttpResponseForbidden("Too many password reset attempts.")
        return super().dispatch(request, *args, **kwargs)


def _pode_painel(user) -> bool:
    return user.is_authenticated and (user.is_staff or _is_master(user) or user.groups.filter(name__in=["recrutador", "admin"]).exists())


class RecruiterRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    def test_func(self):
        return _pode_painel(self.request.user)


class MasterRequiredMixin(RecruiterRequiredMixin):
    def test_func(self):
        return _is_master(self.request.user)


# ───────────── Painel RH: as vagas vivem no ERP; o site age como o usuário do ERP com o mesmo e-mail ─────────────
def _ator(request) -> str:
    return (request.user.email or "").strip().lower()


def _erro_erp(request, e) -> None:
    from .services.erp_client import ErpErro
    if isinstance(e, ErpErro):
        messages.error(request, e.mensagem)
    else:
        messages.error(request, "ERP indisponivel no momento. Tente de novo em instantes.")


class RecruiterJobListView(RecruiterRequiredMixin, View):
    template_name = "careers/admin/job_list.html"
    situacao = None

    def get(self, request):
        from .services.erp_client import ErpErro, ErpIndisponivel
        jobs = []
        try:
            jobs = _erp().listar_vagas(_ator(request), situacao=self.situacao)
        except (ErpErro, ErpIndisponivel) as e:
            _erro_erp(request, e)
        return render(request, self.template_name, {"jobs": jobs, "is_master": _is_master(request.user), "erp_public_url": settings.ERP_PUBLIC_URL})


class ApprovalListView(RecruiterJobListView):
    template_name = "careers/admin/approval_list.html"
    situacao = "em_aprovacao"


class RecruiterJobCreateView(RecruiterRequiredMixin, View):
    template_name = "careers/admin/job_form.html"

    def get(self, request):
        return render(request, self.template_name, {"form": ErpJobForm(), "object": None})

    def post(self, request):
        from .services.erp_client import ErpErro, ErpIndisponivel, job_para_erp
        form = ErpJobForm(request.POST)
        if form.is_valid():
            try:
                _erp().criar_vaga(job_para_erp(form.cleaned_data), _ator(request))
                messages.success(request, "Vaga criada como rascunho no ERP. Envie para aprovacao quando estiver pronta.")
                return redirect("careers:admin_jobs")
            except (ErpErro, ErpIndisponivel) as e:
                _erro_erp(request, e)
        return render(request, self.template_name, {"form": form, "object": None})


class RecruiterJobUpdateView(RecruiterRequiredMixin, View):
    template_name = "careers/admin/job_form.html"

    def _vaga(self, request, pk):
        from .services.erp_client import ErpErro, ErpIndisponivel
        try:
            return _erp().obter_vaga(pk, _ator(request))
        except (ErpErro, ErpIndisponivel) as e:
            _erro_erp(request, e)
            return None

    def get(self, request, pk):
        vaga = self._vaga(request, pk)
        if not vaga:
            return redirect("careers:admin_jobs")
        return render(request, self.template_name, {"form": ErpJobForm(initial=vaga.as_form_initial()), "object": vaga})

    def post(self, request, pk):
        from .services.erp_client import ErpErro, ErpIndisponivel, job_para_erp
        vaga = self._vaga(request, pk)
        if not vaga:
            return redirect("careers:admin_jobs")
        form = ErpJobForm(request.POST)
        if form.is_valid():
            try:
                _erp().editar_vaga(pk, job_para_erp(form.cleaned_data), _ator(request))
                messages.success(request, "Vaga atualizada no ERP.")
                return redirect("careers:admin_jobs")
            except (ErpErro, ErpIndisponivel) as e:
                _erro_erp(request, e)
        return render(request, self.template_name, {"form": form, "object": vaga})


ACOES_PAINEL = {
    "enviar": "Vaga enviada para aprovacao.",
    "aprovar": "Vaga aprovada e publicada no site.",
    "pedir_ajustes": "Ajustes solicitados para a vaga.",
    "rejeitar": "Vaga rejeitada.",
    "pausar": "Vaga pausada (saiu do site).",
    "reabrir": "Vaga reaberta no site.",
    "encerrar": "Vaga encerrada.",
    "marcar_preenchida": "Vaga marcada como preenchida.",
}


@require_POST
def job_action(request, pk, acao):
    """Uma ação de vaga no ERP (enviar, aprovar, pedir ajustes, rejeitar, pausar, reabrir, encerrar, preencher)."""
    from .services.erp_client import ErpErro, ErpIndisponivel
    if not _pode_painel(request.user):
        return redirect("login")
    if acao not in ACOES_PAINEL:
        return HttpResponseForbidden("Acao invalida.")
    motivo = (request.POST.get("motivo") or request.POST.get("rejection_reason") or "").strip() or None
    try:
        _erp().acao_vaga(pk, acao, _ator(request), motivo=motivo)
        messages.success(request, ACOES_PAINEL[acao])
    except (ErpErro, ErpIndisponivel) as e:
        _erro_erp(request, e)
    voltar = request.POST.get("next")
    return redirect("careers:approvals" if voltar == "approvals" else "careers:admin_jobs")


@require_POST
def duplicate_job(request, pk):
    from .services.erp_client import ErpErro, ErpIndisponivel
    if not _pode_painel(request.user):
        return redirect("login")
    try:
        _erp().duplicar_vaga(pk, _ator(request))
        messages.success(request, "Vaga duplicada como rascunho no ERP.")
    except (ErpErro, ErpIndisponivel) as e:
        _erro_erp(request, e)
    return redirect("careers:admin_jobs")


def _vagas_visiveis(request) -> set[str]:
    """Ids das vagas do ERP que o usuário do painel pode ver (vazio se o ERP não responder)."""
    from .services.erp_client import ErpErro, ErpIndisponivel
    try:
        return {v.pk for v in _erp().listar_vagas(_ator(request))}
    except (ErpErro, ErpIndisponivel):
        return set()


class ApplicationListView(RecruiterRequiredMixin, ListView):
    """Status de entrega das candidaturas do site ao ERP (o quadro de etapas fica no ERP)."""

    model = Application
    template_name = "careers/admin/application_list.html"
    context_object_name = "applications"
    paginate_by = 30

    def get_queryset(self):
        qs = Application.objects.select_related("job").order_by("-created_at")
        if not _is_master(self.request.user):
            profile = _profile(self.request.user)
            qs = qs.filter(Q(erp_vaga_id__in=_vagas_visiveis(self.request))
                           | Q(job__created_by=self.request.user) | Q(job__area_owner=profile.area, job__isnull=False))
        job_id = self.request.GET.get("vaga")
        if job_id:
            filtro = Q(erp_vaga_id=job_id)
            if str(job_id).isdigit():
                filtro |= Q(job_id=int(job_id))
            qs = qs.filter(filtro)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["erp_public_url"] = settings.ERP_PUBLIC_URL
        return ctx


def download_application_resume(request, pk):
    if not request.user.is_authenticated or not (request.user.is_staff or _is_master(request.user)):
        return redirect("login")

    application = get_object_or_404(Application.objects.select_related("job"), pk=pk, deleted_at__isnull=True)
    if not _is_master(request.user):
        if application.job_id:
            profile = _profile(request.user)
            permitido = application.job.created_by_id == request.user.id or application.job.area_owner == profile.area
        else:
            permitido = application.erp_vaga_id in _vagas_visiveis(request)
        if not permitido:
            return HttpResponseForbidden("Sem permissao para acessar este curriculo.")

    if application.resume_storage_key:
        try:
            return _serve_supabase_resume(application, application.resume_storage_key)
        except (StorageNotConfigured, ValueError):
            pass
        except Exception:
            logger.exception("Falha ao baixar curriculo da candidatura %s pelo Supabase.", application.pk)

    if application.resume:
        try:
            stored_file = upload_resume_to_supabase(application)
            Application.objects.filter(pk=application.pk).update(resume_storage_key=stored_file.key)
            return _serve_supabase_resume(application, stored_file.key)
        except (StorageNotConfigured, ValueError):
            pass
        except Exception:
            logger.exception("Falha ao reenviar curriculo da candidatura %s para Supabase.", application.pk)

    if application.resume:
        try:
            return _serve_private_resume(application)
        except OSError:
            logger.exception("Arquivo local do curriculo indisponivel para candidatura %s.", application.pk)

    messages.error(request, "Curriculo indisponivel. Verifique a configuracao do storage.")
    return redirect("careers:applications")


def _serve_private_resume(application):
    filename = application.resume_original_name or application.resume.name.rsplit("/", 1)[-1] or "curriculo"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(application.resume.open("rb"), as_attachment=True, filename=filename, content_type=content_type)


def _serve_supabase_resume(application, storage_key: str):
    filename = application.resume_original_name or storage_key.rsplit("/", 1)[-1] or "curriculo"
    downloaded_file = download_resume_from_supabase(storage_key)
    response = HttpResponse(downloaded_file.content, content_type=downloaded_file.content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class UserListView(MasterRequiredMixin, ListView):
    model = get_user_model()
    template_name = "careers/admin/user_list.html"
    context_object_name = "users"

    def get_queryset(self):
        return get_user_model().objects.select_related("career_profile").order_by("username")


def user_create(request):
    if not request.user.is_authenticated or not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode criar usuarios.")
    form = UserProfileForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Usuario criado com permissoes de area.")
        return redirect("careers:user_list")
    return render(request, "careers/admin/user_form.html", {"form": form, "object": None})


def user_update(request, pk):
    if not request.user.is_authenticated or not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode editar usuarios.")
    user = get_object_or_404(get_user_model(), pk=pk)
    form = UserProfileForm(request.POST or None, instance=user)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Usuario atualizado.")
        return redirect("careers:user_list")
    return render(request, "careers/admin/user_form.html", {"form": form, "object": user})


def user_delete(request, pk):
    if not request.user.is_authenticated or not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode excluir usuarios.")
    user = get_object_or_404(get_user_model(), pk=pk)
    if user.pk == request.user.pk:
        messages.error(request, "O usuario master nao pode excluir a propria conta.")
        return redirect("careers:user_list")
    if getattr(user, "career_profile", None) and user.career_profile.role == UserProfile.Role.MASTER:
        messages.error(request, "Contas master nao podem ser excluidas por este painel.")
        return redirect("careers:user_list")
    if request.method == "POST":
        username = user.username
        user.delete()
        messages.success(request, f"Usuario {username} excluido.")
        return redirect("careers:user_list")
    return render(request, "careers/admin/user_confirm_delete.html", {"object": user})


def _client_ip(request) -> str:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _is_rate_limited(request, scope: str, limit: int, window_seconds: int) -> bool:
    key = f"rl:{scope}:{_client_ip(request)}"
    attempts = cache.get(key, 0) + 1
    cache.set(key, attempts, timeout=window_seconds)
    return attempts > limit


def _profile(user) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={
            "role": UserProfile.Role.MASTER if user.is_superuser else UserProfile.Role.RECRUTADOR_AREA,
            "area": "",
            "must_change_password": False,
        },
    )
    return profile


def _is_master(user) -> bool:
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        return user.career_profile.role == UserProfile.Role.MASTER
    except UserProfile.DoesNotExist:
        return False
