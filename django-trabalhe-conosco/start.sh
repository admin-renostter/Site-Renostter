#!/usr/bin/env bash
set -euo pipefail

python manage.py migrate --noinput

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
