from django.urls import path

from . import views

app_name = "careers"

urlpatterns = [
    path("trabalhe-conosco/", views.JobListView.as_view(), name="job_list"),
    path("candidatar/", views.ApplicationCreateView.as_view(), name="apply"),
    path("admin/vagas/", views.RecruiterJobListView.as_view(), name="admin_jobs"),
    path("admin/vagas/nova/", views.RecruiterJobCreateView.as_view(), name="admin_job_create"),
    path("admin/vagas/<int:pk>/editar/", views.RecruiterJobUpdateView.as_view(), name="admin_job_update"),
    path("admin/vagas/<int:pk>/excluir/", views.RecruiterJobDeleteView.as_view(), name="admin_job_delete"),
    path("admin/vagas/<int:pk>/duplicar/", views.duplicate_job, name="admin_job_duplicate"),
    path("admin/vagas/<int:pk>/enviar-aprovacao/", views.submit_job_for_approval, name="admin_job_submit"),
    path("admin/vagas/<int:pk>/aprovar/", views.approve_job, name="admin_job_approve"),
    path("admin/vagas/<int:pk>/solicitar-ajustes/", views.request_job_adjustments, name="admin_job_adjustments"),
    path("admin/vagas/<int:pk>/rejeitar/", views.reject_job, name="admin_job_reject"),
    path("admin/candidaturas/", views.ApplicationListView.as_view(), name="applications"),
    path("admin/candidaturas/<int:pk>/curriculo/", views.download_application_resume, name="application_resume"),
    path("admin/aprovacoes/", views.ApprovalListView.as_view(), name="approvals"),
    path("admin/usuarios/", views.UserListView.as_view(), name="user_list"),
    path("admin/usuarios/novo/", views.user_create, name="user_create"),
    path("admin/usuarios/<int:pk>/editar/", views.user_update, name="user_update"),
    path("admin/usuarios/<int:pk>/excluir/", views.user_delete, name="user_delete"),
]
