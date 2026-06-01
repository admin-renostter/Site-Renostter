from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from careers.models import UserProfile


class Command(BaseCommand):
    help = "Cria ou atualiza o usuario master do Painel RH."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--area", default="")

    def handle(self, *args, **options):
        password = options["password"]
        if len(password) < 12:
            raise CommandError("Use uma senha master com pelo menos 12 caracteres.")

        User = get_user_model()
        user, created = User.objects.get_or_create(username=options["username"])
        user.email = options["email"]
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.MASTER
        profile.area = options["area"]
        profile.must_change_password = True
        profile.save()

        action = "criado" if created else "atualizado"
        self.stdout.write(self.style.SUCCESS(f"Usuario master {action}: {user.username}"))
