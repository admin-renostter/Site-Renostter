#!/usr/bin/env bash
set -euo pipefail

python manage.py migrate --noinput

# STATICFILES_STORAGE = whitenoise.storage.CompressedManifestStaticFilesStorage.
# Esse storage le staticfiles/staticfiles.json para resolver {% static %}.
# Sem collectstatic o arquivo nao existe e TODA pagina com estatico estoura
# ValueError em tempo de render (HTTP 500). Nao e opcional.
python manage.py collectstatic --noinput --clear

# O collectstatic roda como o usuario django (uid 1001) e grava com umask 027:
# arquivos 640, pastas 750. Mas quem SERVE /static/ e o nginx, em outro
# container, como uid 101 - ele nao consegue ler e responde 403.
# a+rX da leitura a todos nos arquivos e travessia nas pastas (X maiusculo so
# marca +x em diretorio, nunca em arquivo comum).
chmod -R a+rX /app/staticfiles

if [ -n "${MASTER_PASSWORD:-}" ]; then
  python manage.py create_master_user \
    --username "${MASTER_USERNAME:-adminrenostter@gmail.com}" \
    --email "${MASTER_EMAIL:-adminrenostter@gmail.com}" \
    --password "$MASTER_PASSWORD"
fi

if [ "${CONFIGURE_SUPABASE_STORAGE_ON_START:-False}" = "True" ]; then
  python manage.py configure_supabase_storage || echo "Supabase Storage validation failed; check Render logs."
fi

gunicorn renostter_careers.wsgi:application --bind "0.0.0.0:${PORT:-8000}"
