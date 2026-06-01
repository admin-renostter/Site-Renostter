from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm, PasswordResetForm

from .models import Application, Job, UserProfile

MAX_RESUME_SIZE = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def apply_field_class(fields):
    for field in fields.values():
        field.widget.attrs.setdefault("class", "careers-field")


class JobFilterForm(forms.Form):
    q = forms.CharField(required=False, label="Busca", widget=forms.SearchInput(attrs={"placeholder": "Cargo, palavra-chave ou descricao"}))
    area = forms.CharField(required=False, label="Area")
    modality = forms.ChoiceField(required=False, label="Modalidade", choices=[("", "Todas as modalidades"), *Job.Modality.choices])
    contract_type = forms.ChoiceField(required=False, label="Contrato", choices=[("", "Todos os contratos"), *Job.ContractType.choices])

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        apply_field_class(self.fields)


class RecruiterAuthenticationForm(AuthenticationForm):
    remember_me = forms.BooleanField(
        required=False,
        initial=True,
        label="Manter conectado por 30 dias",
        widget=forms.CheckboxInput(attrs={"class": "careers-check-input"}),
    )

    username = forms.CharField(
        label="E-mail ou usuario",
        widget=forms.TextInput(attrs={"autocomplete": "username", "placeholder": "seu.usuario", "class": "careers-auth-input"}),
    )
    password = forms.CharField(
        label="Senha",
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "current-password", "placeholder": "********", "class": "careers-auth-input"}),
    )


class RecruiterPasswordResetForm(PasswordResetForm):
    email = forms.EmailField(
        label="E-mail cadastrado",
        widget=forms.EmailInput(attrs={"autocomplete": "email", "placeholder": "rh@renostter.com.br", "class": "careers-auth-input"}),
    )


class ApplicationForm(forms.ModelForm):
    class Meta:
        model = Application
        fields = ["name", "email", "phone", "message", "resume"]
        widgets = {
            "message": forms.Textarea(attrs={"rows": 4, "placeholder": "Mensagem opcional"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        placeholders = {
            "name": "Nome completo",
            "email": "email@exemplo.com",
            "phone": "(11) 99999-9999",
        }
        apply_field_class(self.fields)
        for name, placeholder in placeholders.items():
            self.fields[name].widget.attrs.setdefault("placeholder", placeholder)

    def clean_resume(self):
        resume = self.cleaned_data["resume"]
        if resume.size > MAX_RESUME_SIZE:
            raise forms.ValidationError("O curriculo deve ter no maximo 5 MB.")
        if getattr(resume, "content_type", "") not in ALLOWED_CONTENT_TYPES:
            raise forms.ValidationError("Envie um arquivo PDF, DOC ou DOCX.")
        if not _has_allowed_signature(resume):
            raise forms.ValidationError("O arquivo enviado nao parece ser um PDF, DOC ou DOCX valido.")
        return resume


class JobAdminForm(forms.ModelForm):
    class Meta:
        model = Job
        fields = [
            "title",
            "description",
            "requirements",
            "benefits",
            "location",
            "modality",
            "contract_type",
            "area",
            "expires_at",
            "internal_notes",
        ]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 8}),
            "requirements": forms.Textarea(attrs={"rows": 5}),
            "benefits": forms.Textarea(attrs={"rows": 5}),
            "internal_notes": forms.Textarea(attrs={"rows": 4}),
            "expires_at": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        apply_field_class(self.fields)


class MasterJobAdminForm(JobAdminForm):
    class Meta(JobAdminForm.Meta):
        fields = [*JobAdminForm.Meta.fields, "status", "approval_status", "rejection_reason"]
        widgets = {
            **JobAdminForm.Meta.widgets,
            "rejection_reason": forms.Textarea(attrs={"rows": 4}),
        }


class UserProfileForm(forms.Form):
    username = forms.CharField(label="Usuario", max_length=150)
    email = forms.EmailField(label="E-mail")
    first_name = forms.CharField(label="Nome", max_length=150, required=False)
    password = forms.CharField(label="Senha inicial", widget=forms.PasswordInput)
    role = forms.ChoiceField(label="Perfil", choices=UserProfile.Role.choices)
    area = forms.CharField(label="Area", max_length=100, required=False)

    def __init__(self, *args, **kwargs):
        self.instance = kwargs.pop("instance", None)
        super().__init__(*args, **kwargs)
        apply_field_class(self.fields)
        if self.instance:
            profile = getattr(self.instance, "career_profile", None)
            self.fields["password"].required = False
            self.initial.update(
                {
                    "username": self.instance.username,
                    "email": self.instance.email,
                    "first_name": self.instance.first_name,
                    "role": profile.role if profile else UserProfile.Role.RECRUTADOR_AREA,
                    "area": profile.area if profile else "",
                }
            )

    def clean_username(self):
        username = self.cleaned_data["username"]
        qs = get_user_model().objects.filter(username=username)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("Este usuario ja existe.")
        return username

    def clean_email(self):
        email = self.cleaned_data["email"]
        qs = get_user_model().objects.filter(email=email)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("Este e-mail ja esta em uso.")
        return email

    def save(self):
        User = get_user_model()
        user = self.instance or User()
        user.username = self.cleaned_data["username"]
        user.email = self.cleaned_data["email"]
        user.first_name = self.cleaned_data["first_name"]
        user.is_staff = True
        if self.cleaned_data.get("password"):
            user.set_password(self.cleaned_data["password"])
        user.save()
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = self.cleaned_data["role"]
        profile.area = self.cleaned_data["area"]
        profile.must_change_password = bool(self.cleaned_data.get("password"))
        profile.save()
        return user


def _has_allowed_signature(uploaded_file) -> bool:
    position = uploaded_file.tell()
    header = uploaded_file.read(8)
    uploaded_file.seek(position)
    return (
        header.startswith(b"%PDF")
        or header.startswith(b"PK\x03\x04")
        or header.startswith(bytes.fromhex("D0CF11E0A1B11AE1"))
    )
