from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from careers.views import RecruiterLoginView, RecruiterPasswordResetView, health_check

urlpatterns = [
    path("healthz/", health_check, name="health_check"),
    path(settings.DJANGO_ADMIN_URL, admin.site.urls),
    path("admin/login/", RecruiterLoginView.as_view(), name="login"),
    path("admin/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path(
        "admin/recuperar-senha/",
        RecruiterPasswordResetView.as_view(),
        name="password_reset",
    ),
    path(
        "admin/recuperar-senha/enviado/",
        auth_views.PasswordResetDoneView.as_view(template_name="careers/password_reset_done.html"),
        name="password_reset_done",
    ),
    path(
        "admin/redefinir-senha/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="careers/password_reset_confirm.html",
            success_url="/admin/redefinir-senha/concluido/",
        ),
        name="password_reset_confirm",
    ),
    path(
        "admin/redefinir-senha/concluido/",
        auth_views.PasswordResetCompleteView.as_view(template_name="careers/password_reset_complete.html"),
        name="password_reset_complete",
    ),
    path("", include("careers.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
