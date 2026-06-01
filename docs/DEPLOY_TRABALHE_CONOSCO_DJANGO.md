# Deploy - Trabalhe Conosco Django

## Objetivo

Publicar a area Django em `www.renostter.com` sem quebrar o site principal estatico.

Rotas de producao:

- `/trabalhe-conosco/`
- `/candidatar/`
- `/admin/login/`
- `/admin/vagas/`
- `/<DJANGO_ADMIN_URL>/`

## Checklist Antes de Subir

1. Copiar `django-trabalhe-conosco/.env.production.example` para `.env`.
2. Gerar `SECRET_KEY` forte:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

3. Configurar PostgreSQL.
4. Remover usuarios demo e criar usuarios reais.
5. Configurar SMTP com SPF, DKIM e DMARC no dominio.
6. Garantir que `PRIVATE_MEDIA_ROOT` nao seja servido publicamente.
7. Criar o master inicial:

```bash
python manage.py create_master_user \
  --username master_rh \
  --email master@renostter.com.br \
  --password "troque-por-senha-forte"
```

8. Rodar:

```bash
python manage.py check --deploy
python manage.py migrate
python manage.py collectstatic --noinput
```

Ative `SECURE_HSTS_PRELOAD=True` somente depois de confirmar que todos os subdominios do dominio usam HTTPS corretamente.

## Processos de Producao

Use dois processos separados:

```bash
gunicorn renostter_careers.wsgi:application --bind 127.0.0.1:8000 --workers 3
python manage.py qcluster
```

O `qcluster` processa curriculos, indexacao, auditoria e e-mails fora do request.

## Nginx

Exemplo de reverse proxy:

```nginx
server {
    listen 80;
    server_name renostter.com www.renostter.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name renostter.com www.renostter.com;

    client_max_body_size 6M;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /static/ {
        alias /var/www/renostter/django-trabalhe-conosco/staticfiles/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /media/ {
        return 404;
    }

    location /trabalhe-conosco/ {
        proxy_pass http://127.0.0.1:8000;
        include proxy_params;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /candidatar/ {
        proxy_pass http://127.0.0.1:8000;
        include proxy_params;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        include proxy_params;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /internal-django-admin-renostter/ {
        allow SEU_IP_FIXO;
        deny all;
        proxy_pass http://127.0.0.1:8000;
        include proxy_params;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        root /var/www/renostter/site-estatico;
        try_files $uri $uri/ /index.html;
    }
}
```

## Vulnerabilidades Mitigadas no Codigo

- `SECRET_KEY` obrigatoria em producao.
- HTTPS redirect configuravel.
- HSTS configuravel.
- CSRF e session cookies seguros.
- `DJANGO_ADMIN_URL` configuravel e nao obvio.
- Upload limitado por tamanho.
- Validacao de assinatura basica para PDF/DOC/DOCX.
- Nome de curriculo randomizado.
- Pasta de curriculos privada por padrao.
- Rate limit basico para candidatura, login e recuperacao de senha.
- `media/` bloqueado no Nginx.

## Pontos Ainda Recomendados na Infra

- Antivírus para uploads, como ClamAV.
- Redis para cache/rate limit em ambiente com multiplos workers.
- Backup diario de PostgreSQL e `PRIVATE_MEDIA_ROOT`.
- Monitoramento de logs e alertas.
- Rotina LGPD para retencao e exclusao de curriculos.
