import logging
import mimetypes

from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView, PasswordResetView
from django.core.cache import cache
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.views.generic import CreateView, DeleteView, ListView, UpdateView
from django_q.tasks import async_task

from .forms import ApplicationForm, JobAdminForm, JobFilterForm, MasterJobAdminForm, RecruiterAuthenticationForm, RecruiterPasswordResetForm, UserProfileForm
from .models import Application, Job, UserProfile
from .tasks import send_application_emails
from .services.storage import StorageNotConfigured, create_signed_resume_url
from .services.storage import upload_resume_to_supabase

logger = logging.getLogger(__name__)


class JobListView(ListView):
    model = Job
    template_name = "careers/job_list.html"
    context_object_name = "jobs"
    paginate_by = 20

    def get_queryset(self):
        form = JobFilterForm(self.request.GET)
        qs = Job.objects.filter(status=Job.Status.PUBLICADA, approval_status=Job.ApprovalStatus.APROVADA).filter(Q(expires_at__isnull=True) | Q(expires_at__gte=timezone.localdate()))
        if form.is_valid():
            data = form.cleaned_data
            if data["q"]:
                qs = qs.filter(Q(title__icontains=data["q"]) | Q(description__icontains=data["q"]))
            if data["area"]:
                qs = qs.filter(area__iexact=data["area"])
            if data["modality"]:
                qs = qs.filter(modality=data["modality"])
            if data["contract_type"]:
                qs = qs.filter(contract_type=data["contract_type"])
        return qs.only("id", "title", "description", "location", "modality", "contract_type", "area", "created_at")

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["filter_form"] = JobFilterForm(self.request.GET)
        ctx["areas"] = Job.objects.exclude(area="").values_list("area", flat=True).distinct().order_by("area")
        return ctx


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
        self.job = get_object_or_404(Job, pk=job_id, status=Job.Status.PUBLICADA, approval_status=Job.ApprovalStatus.APROVADA)
        if not self.job.is_open:
            messages.error(request, "Esta vaga nao esta mais aberta.")
            return redirect("careers:job_list")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        form.instance.job = self.job
        if form.instance.resume:
            form.instance.resume_original_name = form.instance.resume.name
        response = super().form_valid(form)
        try:
            stored_file = upload_resume_to_supabase(self.object)
            Application.objects.filter(pk=self.object.pk).update(resume_storage_key=stored_file.key)
            self.object.resume_storage_key = stored_file.key
        except StorageNotConfigured:
            pass
        except Exception:
            logger.exception("Falha ao enviar curriculo da candidatura %s para Supabase.", self.object.pk)
        try:
            send_application_emails(self.object)
        except Exception:
            logger.exception("Falha ao enviar e-mails da candidatura %s.", self.object.pk)
        try:
            async_task("careers.tasks.process_application", self.object.pk)
        except Exception:
            logger.exception("Falha ao agendar processamento da candidatura %s", self.object.pk)
        messages.success(self.request, "Candidatura enviada com sucesso! Em breve entraremos em contato.")
        return response

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["job"] = self.job
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


class RecruiterRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    def test_func(self):
        user = self.request.user
        return user.is_staff or _is_master(user) or user.groups.filter(name__in=["recrutador", "admin"]).exists()


class MasterRequiredMixin(RecruiterRequiredMixin):
    def test_func(self):
        return _is_master(self.request.user)


class RecruiterJobListView(RecruiterRequiredMixin, ListView):
    model = Job
    template_name = "careers/admin/job_list.html"
    context_object_name = "jobs"

    def get_queryset(self):
        qs = Job.objects.select_related("created_by", "approved_by").annotate(total_applications=Count("applications")).order_by("-created_at")
        if _is_master(self.request.user):
            return qs
        profile = _profile(self.request.user)
        return qs.filter(Q(created_by=self.request.user) | Q(area_owner=profile.area))

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["is_master"] = _is_master(self.request.user)
        return ctx


class ApplicationListView(RecruiterRequiredMixin, ListView):
    model = Application
    template_name = "careers/admin/application_list.html"
    context_object_name = "applications"
    paginate_by = 30

    def get_queryset(self):
        qs = Application.objects.select_related("job").order_by("-created_at")
        if _is_master(self.request.user):
            allowed_qs = qs
        else:
            profile = _profile(self.request.user)
            allowed_qs = qs.filter(Q(job__created_by=self.request.user) | Q(job__area_owner=profile.area))
        job_id = self.request.GET.get("vaga")
        if job_id:
            allowed_qs = allowed_qs.filter(job_id=job_id)
        return allowed_qs


def download_application_resume(request, pk):
    if not request.user.is_authenticated or not (request.user.is_staff or _is_master(request.user)):
        return redirect("login")

    application = get_object_or_404(Application.objects.select_related("job"), pk=pk)
    if not _is_master(request.user):
        profile = _profile(request.user)
        if application.job.created_by_id != request.user.id and application.job.area_owner != profile.area:
            return HttpResponseForbidden("Sem permissao para acessar este curriculo.")

    if application.resume_storage_key:
        try:
            return redirect(create_signed_resume_url(application.resume_storage_key))
        except (StorageNotConfigured, ValueError):
            pass
        except Exception:
            logger.exception("Falha ao gerar link assinado para candidatura %s", application.pk)

    if application.resume:
        try:
            stored_file = upload_resume_to_supabase(application)
            Application.objects.filter(pk=application.pk).update(resume_storage_key=stored_file.key)
            return redirect(create_signed_resume_url(stored_file.key))
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


class RecruiterJobCreateView(RecruiterRequiredMixin, CreateView):
    model = Job
    form_class = JobAdminForm
    template_name = "careers/admin/job_form.html"
    success_url = reverse_lazy("careers:admin_jobs")

    def get_form_class(self):
        return MasterJobAdminForm if _is_master(self.request.user) else JobAdminForm

    def form_valid(self, form):
        form.instance.created_by = self.request.user
        if not form.instance.area_owner:
            form.instance.area_owner = form.cleaned_data.get("area") or _profile(self.request.user).area
        if _is_master(self.request.user):
            form.instance.approved_by = self.request.user if form.instance.approval_status == Job.ApprovalStatus.APROVADA else None
            if form.instance.approval_status == Job.ApprovalStatus.APROVADA and form.instance.status == Job.Status.PUBLICADA:
                form.instance.approved_at = timezone.now()
                form.instance.published_at = timezone.now()
        else:
            form.instance.status = Job.Status.RASCUNHO
            form.instance.approval_status = Job.ApprovalStatus.RASCUNHO
        messages.success(self.request, "Vaga criada como rascunho. Envie para aprovacao quando estiver pronta.")
        return super().form_valid(form)


class RecruiterJobUpdateView(RecruiterRequiredMixin, UpdateView):
    model = Job
    form_class = JobAdminForm
    template_name = "careers/admin/job_form.html"
    success_url = reverse_lazy("careers:admin_jobs")

    def get_queryset(self):
        qs = super().get_queryset()
        if _is_master(self.request.user):
            return qs
        return qs.filter(created_by=self.request.user, status__in=[Job.Status.RASCUNHO, Job.Status.AJUSTES, Job.Status.REJEITADA])

    def get_form_class(self):
        return MasterJobAdminForm if _is_master(self.request.user) else JobAdminForm

    def form_valid(self, form):
        if not _is_master(self.request.user) and form.instance.status in [Job.Status.AJUSTES, Job.Status.REJEITADA]:
            form.instance.status = Job.Status.RASCUNHO
            form.instance.approval_status = Job.ApprovalStatus.RASCUNHO
            form.instance.rejection_reason = ""
        messages.success(self.request, "Vaga atualizada com sucesso.")
        return super().form_valid(form)


class RecruiterJobDeleteView(RecruiterRequiredMixin, DeleteView):
    model = Job
    template_name = "careers/admin/job_confirm_delete.html"
    success_url = reverse_lazy("careers:admin_jobs")

    def form_valid(self, form):
        if self.object.applications.exists():
            self.object.status = Job.Status.PREENCHIDA
            self.object.save(update_fields=["status", "updated_at"])
            messages.info(self.request, "A vaga possui candidaturas e foi marcada como preenchida.")
            return redirect(self.success_url)
        return super().form_valid(form)


@require_POST
def duplicate_job(request, pk):
    if not request.user.is_authenticated or not (request.user.is_staff or request.user.groups.filter(name__in=["recrutador", "admin"]).exists()):
        return redirect("login")
    job = get_object_or_404(Job, pk=pk)
    job.pk = None
    job.title = f"{job.title} (copia)"
    job.created_by = request.user
    job.approved_by = None
    job.approved_at = None
    job.published_at = None
    job.status = Job.Status.RASCUNHO
    job.approval_status = Job.ApprovalStatus.RASCUNHO
    job.rejection_reason = ""
    job.save()
    messages.success(request, "Vaga duplicada como rascunho.")
    return redirect("careers:admin_jobs")


@require_POST
def submit_job_for_approval(request, pk):
    job = get_object_or_404(Job, pk=pk)
    if not (_is_master(request.user) or job.created_by_id == request.user.id):
        return HttpResponseForbidden("Sem permissao para enviar esta vaga.")
    job.status = Job.Status.EM_APROVACAO
    job.approval_status = Job.ApprovalStatus.PENDENTE
    job.rejection_reason = ""
    job.save(update_fields=["status", "approval_status", "rejection_reason", "updated_at"])
    messages.success(request, "Vaga enviada para aprovacao do master.")
    return redirect("careers:admin_jobs")


@require_POST
def approve_job(request, pk):
    if not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode aprovar vagas.")
    job = get_object_or_404(Job, pk=pk)
    now = timezone.now()
    job.status = Job.Status.PUBLICADA
    job.approval_status = Job.ApprovalStatus.APROVADA
    job.approved_by = request.user
    job.approved_at = now
    job.published_at = now
    job.rejection_reason = ""
    job.save(update_fields=["status", "approval_status", "approved_by", "approved_at", "published_at", "rejection_reason", "updated_at"])
    messages.success(request, "Vaga aprovada e publicada no site.")
    return redirect("careers:approvals")


@require_POST
def request_job_adjustments(request, pk):
    if not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode solicitar ajustes.")
    job = get_object_or_404(Job, pk=pk)
    job.status = Job.Status.AJUSTES
    job.approval_status = Job.ApprovalStatus.AJUSTES
    job.rejection_reason = request.POST.get("rejection_reason", "").strip() or "Ajustes solicitados pelo master."
    job.save(update_fields=["status", "approval_status", "rejection_reason", "updated_at"])
    messages.info(request, "Ajustes solicitados para a vaga.")
    return redirect("careers:approvals")


@require_POST
def reject_job(request, pk):
    if not _is_master(request.user):
        return HttpResponseForbidden("Somente o master pode rejeitar vagas.")
    job = get_object_or_404(Job, pk=pk)
    job.status = Job.Status.REJEITADA
    job.approval_status = Job.ApprovalStatus.REJEITADA
    job.rejection_reason = request.POST.get("rejection_reason", "").strip() or "Vaga rejeitada pelo master."
    job.save(update_fields=["status", "approval_status", "rejection_reason", "updated_at"])
    messages.warning(request, "Vaga rejeitada.")
    return redirect("careers:admin_jobs")


class ApprovalListView(MasterRequiredMixin, ListView):
    model = Job
    template_name = "careers/admin/approval_list.html"
    context_object_name = "jobs"

    def get_queryset(self):
        return Job.objects.select_related("created_by").filter(approval_status=Job.ApprovalStatus.PENDENTE).order_by("updated_at")


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
