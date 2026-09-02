#!/usr/bin/env bash
# ============================================================
# Renostter - Restore a partir de um backup
# ============================================================
# Uso:
#   bash deploy/scripts/restore.sh                           # restaura o mais recente
#   bash deploy/scripts/restore.sh /path/to/backup-XXX.tar.gz  # restaura um especifico
#
# CUIDADO: isso SUBSTITUI o banco atual. Faz dump do atual
# antes em /tmp/pre-restore-*.sql.gz por seguranca.
# ============================================================

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/renostter/deploy}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/renostter}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERRO: $*"; exit 1; }
warn() { log "ATENCAO: $*"; }

# ---------- 1. Escolhe o arquivo ----------
if [[ -n "${1:-}" ]]; then
    ARCHIVE="$1"
    [[ -f "$ARCHIVE" ]] || die "Arquivo nao encontrado: $ARCHIVE"
else
    ARCHIVE=$(ls -t "$BACKUP_ROOT/daily"/*.tar.gz 2>/dev/null | head -1 || true)
    [[ -z "$ARCHIVE" ]] && ARCHIVE=$(ls -t "$BACKUP_ROOT/weekly"/*.tar.gz 2>/dev/null | head -1 || true)
    [[ -z "$ARCHIVE" ]] && die "Nenhum backup encontrado em $BACKUP_ROOT"
fi

log "Arquivo de backup: $ARCHIVE"
ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
log "Tamanho: $ARCHIVE_SIZE"

# ---------- 2. Confirmacao ----------
warn "Esse procedimento vai SUBSTITUIR o banco atual!"
warn "O dump do banco atual sera salvo em /tmp/pre-restore-*.sql.gz antes."
read -p "Continuar? (s/N) " -n 1 -r
echo
[[ $REPLY =~ ^[Ss]$ ]] || { log "Abortado."; exit 0; }

# ---------- 3. Pre-restore safety dump ----------
PRE_DUMP="/tmp/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
log "Salvando banco atual em $PRE_DUMP..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-renostter_app}" \
             -d "${POSTGRES_DB:-renostter_careers}" \
    | gzip > "$PRE_DUMP"
log "Pre-restore salvo: $(du -h $PRE_DUMP | cut -f1)"

# ---------- 4. Extrai o backup ----------
WORK_DIR=$(mktemp -d)
log "Extraindo em $WORK_DIR..."
tar xzf "$ARCHIVE" -C "$WORK_DIR"
ls -la "$WORK_DIR"

PGDUMP=$(ls "$WORK_DIR"/pgdump-*.sql.gz 2>/dev/null | head -1)
MEDIA=$(ls "$WORK_DIR"/private_media-*.tar.gz 2>/dev/null | head -1)
[[ -z "$PGDUMP" ]] && die "pgdump nao encontrado no arquivo"

# ---------- 5. Para o worker (para nao conflitar com restore) ----------
log "Parando worker..."
docker compose -f "$COMPOSE_FILE" stop worker

# ---------- 6. Restaura o banco ----------
log "Restaurando banco (pode demorar)..."
gunzip -c "$PGDUMP" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-renostter_app}" \
         -d "${POSTGRES_DB:-renostter_careers}" \
         --set ON_ERROR_STOP=on
log "Banco restaurado"

# ---------- 7. Restaura private_media ----------
if [[ -n "$MEDIA" ]]; then
    log "Restaurando private_media..."
    docker run --rm \
        -v renostter_django_private_media:/data \
        -v "$WORK_DIR:/backup:ro" \
        alpine:3.20 \
        sh -c "rm -rf /data/* && tar xzf /backup/$(basename $MEDIA) -C /data"
    log "private_media restaurado"
fi

# ---------- 8. Sobe o worker de novo ----------
log "Subindo worker..."
docker compose -f "$COMPOSE_FILE" start worker

# ---------- 9. Limpa tmp ----------
rm -rf "$WORK_DIR"

log "===== RESTORE CONCLUIDO ====="
log "Verifique o sistema: https://carreiras.renostter.com/trabalhe-conosco/"
log "Pre-restore (caso precise reverter): $PRE_DUMP"
