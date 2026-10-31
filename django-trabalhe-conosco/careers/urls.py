from django.urls import path

from . import views

app_name = "careers"

urlpatterns = [
    path("trabalhe-conosco/", views.JobListView.as_view(), name="job_list"),
    # chamado só pelo ERP, pela rede Docker interna (assinado)
    path("integracao/erp/vagas-mudaram", views.erp_vagas_mudaram, name="erp_vagas_mudaram"),
    path("candidatar/", views.ApplicationCreateView.as_view(), name="apply"),
    path("admin/vagas/", views.RecruiterJobListView.as_view(), name="admin_jobs"),
    path("admin/vagas/nova/", views.RecruiterJobCreateView.as_view(), name="admin_job_create"),
    path("admin/vagas/<str:pk>/editar/", views.RecruiterJobUpdateView.as_view(), name="admin_job_update"),
    path("admin/vagas/<str:pk>/duplicar/", views.duplicate_job, name="admin_job_duplicate"),
    path("admin/vagas/<str:pk>/acao/<slug:acao>/", views.job_action, name="admin_job_action"),
    path("admin/candidaturas/", views.ApplicationListView.as_view(), name="applications"),
    path("admin/candidaturas/<int:pk>/curriculo/", views.download_application_resume, name="application_resume"),
    path("admin/aprovacoes/", views.ApprovalListView.as_view(), name="approvals"),
    path("admin/usuarios/", views.UserListView.as_view(), name="user_list"),
    path("admin/usuarios/novo/", views.user_create, name="user_create"),
    path("admin/usuarios/<int:pk>/editar/", views.user_update, name="user_update"),
    path("admin/usuarios/<int:pk>/excluir/", views.user_delete, name="user_delete"),
]
