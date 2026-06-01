from django.contrib import admin

from .models import Application, Job, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "area", "must_change_password", "updated_at")
    list_filter = ("role", "area", "must_change_password")
    search_fields = ("user__username", "user__email", "area")


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("title", "area_owner", "location", "modality", "contract_type", "status", "approval_status", "created_at")
    list_filter = ("status", "approval_status", "area_owner", "modality", "contract_type")
    search_fields = ("title", "description", "requirements")
    date_hierarchy = "created_at"


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ("name", "job", "email", "qa_score", "created_at")
    list_filter = ("job", "created_at")
    search_fields = ("name", "email", "message", "resume_text")
    readonly_fields = ("resume_text", "qa_score", "created_at")
