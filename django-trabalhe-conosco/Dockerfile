# ============================================================
# Renostter Careers (Django + Gunicorn)
# Imagem leve para producao. Pacotes de ML (Docling, LanceDB,
# transformers, torch) ficam em requirements-heavy.txt e so
# sao instalados se a build-arg INSTALL_ML=true.
# ============================================================

# ---------- build stage ----------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libpq-dev \
        libffi-dev \
        libssl-dev \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias leves primeiro (cache de camadas)
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Dependencias pesadas (opcional, build-arg INSTALL_ML=true)
ARG INSTALL_ML=false
COPY requirements-heavy.txt* ./
RUN if [ "$INSTALL_ML" = "true" ] && [ -f requirements-heavy.txt ]; then \
        pip install -r requirements-heavy.txt; \
    fi

# ---------- runtime stage ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=renostter_careers.settings

# Dependencias de sistema (somente o necessario em runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        libxml2 \
        libxslt1.1 \
        tini \
        curl \
        gettext \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r -g 1001 django \
    && useradd -r -u 1001 -g django -d /app -s /usr/sbin/nologin django

WORKDIR /app

# Copia o venv e o codigo do builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --chown=django:django . /app

# Diretorios que o app precisa escrever
RUN mkdir -p /app/staticfiles /app/private_media /app/lancedb /app/audit /app/logs \
    && chown -R django:django /app

USER django

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz/ || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]

# Comando padrao: migra + cria master + sobe gunicorn
# Pode ser sobrescrito em producao via docker-compose
CMD ["bash", "start.sh"]
