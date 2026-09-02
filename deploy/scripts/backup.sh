#!/usr/bin/env bash
# ============================================================
# Renostter - Backup automatizado
# ============================================================
# Faz dump do Postgres + copia volumes Docker + envia pro Backblaze B2
# Uso: bash deploy/scripts/backup.sh
# Cron:  0 3 * * * (todo dia as 3h da manha)
#
# Retencao: 7 daily + 4 weekly + 3 monthly (local)
#           e tudo no B2 ate expirar (configuravel)
# ============================================================

set -euo pipefail

# ---------- Configuracao ----------
DEPLOY_DIR="${DEPLOY_DIR:-/opt/renostter/deploy}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/renostter}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
DATE=$(date +%Y%m%d-%H%M%S)
DAY_OF_WEEK=$(date +%u)
DAY_OF_MONTH=$(date +%d)

# Carrega .env (POSTGRES_PASSWORD, B2_*, etc)
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

B2_BUCKET_NAME="${B2_BUCKET_NAME:-renostter-backups}"
LOCAL_KEEP_DAILY=7
LOCAL_KEEP_WEEKLY=4
LOCAL_KEEP_MONTHLY=3

# ---------- Helpers ----------
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERRO: $*"; exit 1; }

# ---------- Pre-checks ----------
command -v docker >/dev/null || die "docker nao encontrado"
[[ -f "$COMPOSE_FILE" ]] || die "docker-compose nao encontrado em $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die ".env nao encontrado em $ENV_FILE"

mkdir -p "$BACKUP_ROOT"/{daily,weekly,monthly,tmp}

# ---------- 1. Dump do Postgres ----------
log "Iniciando pg_dump..."
DUMP_FILE="$BACKUP_ROOT/tmp/pgdump-$DATE.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-renostter_app}" \
             -d "${POSTGRES_DB:-renostter_careers}" \
             --no-owner --no-acl --clean --if-exists \
    | gzip -9 > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump criado: $DUMP_FILE ($DUMP_SIZE)"

# ---------- 2. Tar do volume private_media (currículos) ----------
log "Copiando private_media (curriculos)..."
MEDIA_FILE="$BACKUP_ROOT/tmp/private_media-$DATE.tar.gz"
docker run --rm \
    -v renostter_django_private_media:/data:ro \
    -v "$BACKUP_ROOT/tmp:/backup" \
    alpine:3.20 \
    tar czf "/backup/private_media-$DATE.tar.gz" -C /data .
MEDIA_SIZE=$(du -h "$MEDIA_FILE" | cut -f1)
log "Media copiada: $MEDIA_FILE ($MEDIA_SIZE)"

# ---------- 3. Manifesto do backup ----------
MANIFEST="$BACKUP_ROOT/tmp/manifest-$DATE.json"
cat > "$MANIFEST" <<EOF
{
  "date": "$DATE",
  "hostname": "$(hostname)",
  "services": {
    "postgres": "$(docker compose -f $COMPOSE_FILE exec -T postgres pg_isready | head -1 | xargs)",
    "web":      "$(docker inspect -f '{{.State.Health.Status}}' renostter-web 2>/dev/null || echo "unknown")",
    "worker":   "$(docker inspect -f '{{.State.Health.Status}}' renostter-worker 2>/dev/null || echo "unknown")"
  },
  "files": {
    "pgdump":     "$(basename $DUMP_FILE) ($DUMP_SIZE)",
    "media":      "$(basename $MEDIA_FILE) ($MEDIA_SIZE)"
  }
}
EOF

# ---------- 4. Arquivo unico ----------
ARCHIVE="$BACKUP_ROOT/tmp/backup-$DATE.tar.gz"
tar czf "$ARCHIVE" -C "$BACKUP_ROOT/tmp" \
    "pgdump-$DATE.sql.gz" \
    "private_media-$DATE.tar.gz" \
    "manifest-$DATE.json"

rm "$DUMP_FILE" "$MEDIA_FILE" "$MANIFEST"
ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
log "Arquivo unico: $ARCHIVE ($ARCHIVE_SIZE)"

# ---------- 5. Espelhamento (daily / weekly / monthly) ----------
cp "$ARCHIVE" "$BACKUP_ROOT/daily/"
[[ "$DAY_OF_WEEK" == "7" ]] && cp "$ARCHIVE" "$BACKUP_ROOT/weekly/"
[[ "$DAY_OF_MONTH" == "01" ]] && cp "$ARCHIVE" "$BACKUP_ROOT/monthly/"

# ---------- 6. Retencao local ----------
log "Aplicando retencao local..."
# Daily: manter 7
find "$BACKUP_ROOT/daily" -name "backup-*.tar.gz" -mtime +$LOCAL_KEEP_DAILY -delete 2>/dev/null
# Weekly: manter 4
find "$BACKUP_ROOT/weekly" -name "backup-*.tar.gz" -mtime +$((LOCAL_KEEP_WEEKLY*7)) -delete 2>/dev/null
# Monthly: manter 3
find "$BACKUP_ROOT/monthly" -name "backup-*.tar.gz" -mtime +$((LOCAL_KEEP_MONTHLY*30)) -delete 2>/dev/null

# ---------- 7. Upload pro Backblaze B2 (se configurado) ----------
if [[ -n "${B2_APPLICATION_KEY_ID:-}" ]] && [[ -n "${B2_APPLICATION_KEY:-}" ]]; then
    log "Enviando para Backblaze B2..."
    command -v b2 >/dev/null || {
        # Instala o cliente b2 via pip
        pip install --quiet b2 2>/dev/null || pip3 install --quiet b2 2>/dev/null || {
            warn "b2 nao instalado - pulando upload. Instale com: pip install b2"
        }
    }
    if command -v b2 >/dev/null; then
        # Authorize (cache 24h)
        b2 account authorize "$B2_APPLICATION_KEY_ID" "$B2_APPLICATION_KEY" >/dev/null 2>&1 || true
        b2 upload-file --no-progress "$B2_BUCKET_NAME" "$ARCHIVE" "renostter/$(basename $ARCHIVE)" 2>&1 | tail -3
        log "Upload B2 concluido"
    fi
else
    log "B2 nao configurado - backup apenas local em $BACKUP_ROOT"
fi

# ---------- 8. Limpa tmp ----------
rm -f "$ARCHIVE"
find "$BACKUP_ROOT/tmp" -type f -mmin +60 -delete 2>/dev/null

# ---------- 9. Resumo ----------
USED=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)
DAILY_COUNT=$(ls "$BACKUP_ROOT/daily" 2>/dev/null | wc -l)
WEEKLY_COUNT=$(ls "$BACKUP_ROOT/weekly" 2>/dev/null | wc -l)
MONTHLY_COUNT=$(ls "$BACKUP_ROOT/monthly" 2>/dev/null | wc -l)

log "===== BACKUP CONCLUIDO ====="
log "Tamanho usado: $USED | daily=$DAILY_COUNT weekly=$WEEKLY_COUNT monthly=$MONTHLY_COUNT"

# ---------- 10. Notifica Uptime Kuma (push) ----------
PUSH_URL="${UPTIME_KUMA_PUSH_URL:-}"
if [[ -n "$PUSH_URL" ]]; then
    curl -fsS -m 5 -A "renostter-backup/1.0" "$PUSH_URL" >/dev/null 2>&1 \
        && log "Push enviado pro Uptime Kuma (OK)" \
        || log "Falha ao enviar push pro Uptime Kuma (nao critico)"
fi

log "Proximo backup automatico: amanha 03:00 (cron)"
