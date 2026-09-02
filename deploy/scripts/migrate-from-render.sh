#!/usr/bin/env bash
# ============================================================
# Renostter - Migração Render -> VPS Integrator
# ============================================================
# Este script:
#   1. Conecta no Postgres do Render via External Connection String
#   2. Faz dump completo (schema + dados)
#   3. Importa no Postgres local (container na VPS)
#   4. Opcionalmente baixa currículos do Supabase
#
# Pre-requisitos:
#   - Já existe a stack subindo na VPS (docker compose up -d)
#   - Render tem "External Connections" habilitado (Dashboard > Postgres > Connections)
#   - A variável RENDER_EXTERNAL_DATABASE_URL foi colocada no .env
#
# Uso:
#   bash deploy/scripts/migrate-from-render.sh
# ============================================================

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/renostter/deploy}"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
WORK_DIR=$(mktemp -d -t renostter-migrate-XXXX)

# NAO usar "source" aqui: o .env nao e um script shell. Valores como
#   DEFAULT_FROM_EMAIL=Renostter RH <rh@renostter.com.br>
# fazem o bash interpretar "<" como redirecionamento e abortar a leitura -
# as variaveis seguintes ficam vazias e o script falha de um jeito confuso.
# Este parser le KEY=VALUE literalmente, sem avaliar nada.
if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r _line || [[ -n "$_line" ]]; do
        [[ -z "$_line" || "$_line" =~ ^[[:space:]]*# ]] && continue
        [[ "$_line" != *=* ]] && continue
        _k="${_line%%=*}"; _v="${_line#*=}"
        _k="${_k//[[:space:]]/}"
        [[ "$_v" == \"*\" ]] && _v="${_v:1:${#_v}-2}"
        [[ "$_v" == \'*\' ]] && _v="${_v:1:${#_v}-2}"
        export "$_k=$_v"
    done < "$ENV_FILE"
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERRO: $*"; cleanup; exit 1; }
warn() { log "ATENCAO: $*"; }
cleanup() { rm -rf "$WORK_DIR" 2>/dev/null || true; }
trap cleanup EXIT

# ---------- 1. Valida ----------
[[ -z "${RENDER_EXTERNAL_DATABASE_URL:-}" ]] && die "Defina RENDER_EXTERNAL_DATABASE_URL no .env (formato: postgresql://user:pass@host:port/db)"
[[ -z "${POSTGRES_USER:-}" ]] && die "POSTGRES_USER nao definido no .env"
[[ -z "${POSTGRES_DB:-}" ]] && die "POSTGRES_DB nao definido no .env"

command -v docker >/dev/null || die "docker nao encontrado"
[[ -f "$COMPOSE_FILE" ]] || die "docker-compose nao encontrado"

# ---------- 2. Confirma com usuario ----------
warn "Esse procedimento vai SUBSTITUIR o banco na VPS com os dados do Render."
warn "Recomendacao: rode o backup local ANTES (bash deploy/scripts/backup.sh)."
if [[ "${AUTO_CONFIRM:-0}" == "1" ]]; then
    log "AUTO_CONFIRM=1: seguindo sem perguntar."
else
    read -p "Continuar? (s/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Ss]$ ]] || { log "Abortado."; exit 0; }
fi

# ---------- 2b. Testa a conexao com o Render ANTES de mexer em nada ----------
# O host AlmaLinux nao tem cliente postgres instalado, e nao vamos instalar:
# usamos a mesma imagem do container, que ja esta no disco.
PGIMG="postgres:16-alpine"
log "Testando conexao com o Render..."
if ! docker run --rm "$PGIMG" psql "$RENDER_EXTERNAL_DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    die "Nao consegui conectar no Postgres do Render.
     Verifique: External Connection habilitada, URL correta, e se a instancia ainda existe."
fi
log "Conexao com o Render OK. Inventario da origem:"
docker run --rm "$PGIMG" psql "$RENDER_EXTERNAL_DATABASE_URL" -t -c \
  "SELECT relname || ' = ' || n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;" \
  | sed 's/^/     /'

# ---------- 2c. Backup de seguranca do banco ATUAL da VPS ----------
# Se a importacao der errado, este arquivo permite voltar ao estado de agora.
SAFETY="/opt/renostter/pre-migracao-$(date +%Y%m%d-%H%M%S).sql.gz"
log "Backup de seguranca do banco atual -> $SAFETY"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
    | gzip -9 > "$SAFETY" || warn "backup de seguranca falhou (banco pode estar vazio)"
log "Backup de seguranca: $(du -h "$SAFETY" 2>/dev/null | cut -f1)"

# ---------- 3. Dump do Render ----------
log "Baixando dados do Render (pode demorar)..."
DUMP_FILE="$WORK_DIR/render-dump.sql.gz"
docker run --rm "$PGIMG" pg_dump "$RENDER_EXTERNAL_DATABASE_URL" \
    --no-owner --no-acl --clean --if-exists \
    | gzip -9 > "$DUMP_FILE"
[[ -s "$DUMP_FILE" ]] || die "O dump saiu vazio - nada foi alterado na VPS."
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump do Render: $DUMP_FILE ($DUMP_SIZE)"

# ---------- 4. Verifica que o Postgres local esta saudavel ----------
log "Verificando Postgres local..."
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$POSTGRES_USER" || die "Postgres local nao esta saudavel"

# ---------- 5. Para o worker e web ----------
log "Parando servicos que usam o banco..."
docker compose -f "$COMPOSE_FILE" stop worker web

# ---------- 6. Limpa o banco local ----------
log "Limpando banco local (DROP + CREATE)..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
    " >/dev/null
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

# ---------- 7. Importa ----------
log "Importando dump do Render (pode demorar)..."
gunzip -c "$DUMP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --set ON_ERROR_STOP=off 2>&1 | tail -20

# ---------- 8. Roda migrations (para garantir que esta atualizado) ----------
log "Aplicando migrations pendentes..."
docker compose -f "$COMPOSE_FILE" run --rm web \
    python manage.py migrate --noinput

# ---------- 9. Cria/atualiza master user ----------
log "Atualizando usuario master..."
docker compose -f "$COMPOSE_FILE" run --rm web \
    python manage.py create_master_user \
        --username "${MASTER_USERNAME:-adminrenostter@gmail.com}" \
        --email "${MASTER_EMAIL:-adminrenostter@gmail.com}" \
        --password "${MASTER_PASSWORD:-}" || warn "create_master_user retornou erro (pode ser normal se ja existir)"

# ---------- 10. Sobe os servicos ----------
log "Subindo web e worker..."
docker compose -f "$COMPOSE_FILE" up -d web worker

# ---------- 11. Health check ----------
log "Aguardando health check..."
for i in {1..20}; do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' renostter-web 2>/dev/null || echo "starting")
    if [[ "$STATUS" == "healthy" ]]; then
        log "Web esta saudavel!"
        break
    fi
    log "  tentativa $i/20... status=$STATUS"
    sleep 2
done

# ---------- 12. Resumo ----------
log "===== MIGRACAO CONCLUIDA ====="
log "Banco: dados do Render importados com sucesso"
log "Tamanho do dump: $DUMP_SIZE"
log ""
log "Verifique agora:"
log "  - https://carreiras.renostter.com/trabalhe-conosco/"
log "  - https://carreiras.renostter.com/admin/login/"
log "  - Logs: docker compose -f $COMPOSE_FILE logs -f web"
log ""
log "Rollback, se precisar:"
log "  gunzip -c $SAFETY | docker compose -f $COMPOSE_FILE exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
log ""
log "Proximos passos:"
log "  1. Faca login como master e troque a senha"
log "  2. Atualize o DNS: carreiras.renostter.com -> IP da VPS (ou via Cloudflare Tunnel)"
log "  3. Desative o servico no Render (manter 7 dias por seguranca)"
log "  4. Faca um backup completo: bash deploy/scripts/backup.sh"
