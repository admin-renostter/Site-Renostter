#!/usr/bin/env bash
# ============================================================
# Renostter - Deploy completo da VPS (one-shot)
# ============================================================
# Executa em ordem:
#   1. hardening (firewall, fail2ban, SSH) - escolhe o script pela distro
#   2. Valida que .env existe
#   3. docker compose up -d (sobe toda a stack)
#   4. Aguarda health check
#   5. cloudflared-setup.sh (cria tunnel + DNS)
#   6. Configura cron de backup
#
# Uso:
#   sudo bash /opt/renostter/deploy/scripts/deploy-all.sh
#
# Idempotente: pode rodar mais de uma vez sem quebrar.
# ============================================================

set -euo pipefail

# Caminho padrão do deploy
DEPLOY_DIR="${DEPLOY_DIR:-/opt/renostter/deploy}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
banner() { echo -e "\n${CYAN}========================================\n  $1\n========================================${NC}"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ATENCAO]${NC} $1"; }
die() { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
ask() { read -p "$1" -n 1 -r; echo; [[ $REPLY =~ ^[SsYy]$ ]]; }

# ---------- Pre-checks ----------
[[ $EUID -ne 0 ]] && die "Rode como root: sudo bash $0"
[[ -d "$DEPLOY_DIR" ]] || die "Diretorio $DEPLOY_DIR nao existe. Copie os arquivos primeiro."

banner "Renostter - Deploy completo da VPS"

# ---------- 1. Hardening ----------
banner "Etapa 1/6 - Hardening do sistema"
# AlmaLinux/RHEL usa dnf + firewalld; Ubuntu/Debian usa apt + ufw.
if command -v dnf >/dev/null; then
    HARDEN_SCRIPT="hardening-el.sh"; HARDEN_DESC="dnf, firewalld, fail2ban, SSH"
else
    HARDEN_SCRIPT="hardening.sh";    HARDEN_DESC="apt, UFW, fail2ban, SSH"
fi
if ask "Rodar $HARDEN_SCRIPT? ($HARDEN_DESC) [s/N]"; then
    bash "$DEPLOY_DIR/scripts/$HARDEN_SCRIPT"
    ok "Hardening concluido"
else
    warn "Hardening pulado (pode ja ter sido feito)"
fi

# ---------- 2. Valida .env ----------
banner "Etapa 2/6 - Validando .env"
if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
    if [[ -f "$DEPLOY_DIR/.env.example" ]]; then
        cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
        warn ".env criado a partir de .env.example"
        warn "EDITE $DEPLOY_DIR/.env antes de continuar (POSTGRES_PASSWORD, SECRET_KEY, etc)"
        die "Abra o arquivo, preencha e rode este script novamente"
    else
        die ".env e .env.example nao encontrados em $DEPLOY_DIR"
    fi
fi
ok ".env presente"

# Garante que POSTGRES_PASSWORD nao e placeholder
if grep -q "troque-por-senha-forte" "$DEPLOY_DIR/.env"; then
    die "POSTGRES_PASSWORD ainda e placeholder. Edite $DEPLOY_DIR/.env"
fi
ok "POSTGRES_PASSWORD configurado"

# ---------- 3. Sobe a stack ----------
banner "Etapa 3/6 - Subindo a stack Docker"
cd "$DEPLOY_DIR"
if ask "Subir a stack agora? [s/N]"; then
    # Verifica se ja esta rodando
    if docker compose ps 2>/dev/null | grep -q "Up"; then
        warn "Stack ja esta rodando - pulando up"
        docker compose ps
    else
        docker compose up -d --remove-orphans
        ok "Stack iniciada"
    fi
fi

# ---------- 4. Health check ----------
banner "Etapa 4/6 - Aguardando health check"
echo "Aguardando 60s para Postgres inicializar..."
sleep 60

cd "$DEPLOY_DIR"
if docker compose ps web 2>/dev/null | grep -q "(healthy)"; then
    ok "Web esta saudavel"
else
    warn "Web nao esta healthy ainda. Aguardando mais 30s..."
    sleep 30
    if docker compose ps web 2>/dev/null | grep -q "(healthy)"; then
        ok "Web esta saudavel (apos retry)"
    else
        warn "Web ainda nao esta healthy. Rode manualmente:"
        warn "  cd $DEPLOY_DIR && docker compose logs -f web"
    fi
fi

# Testa healthz
if curl -fsS -m 5 http://127.0.0.1:8080/healthz/ -H "Host: carreiras.renostter.com" 2>/dev/null; then
    ok "Healthz responde: 200 OK"
else
    warn "Healthz nao responde (pode ser normal se Cloudflare Tunnel ainda nao estiver configurado)"
fi

# ---------- 5. Cloudflare Tunnel ----------
banner "Etapa 5/6 - Cloudflare Tunnel"
if [[ -f "$DEPLOY_DIR/cloudflared/renostter.json" ]]; then
    ok "Credenciais do tunnel ja existem - pulando setup"
else
    if ask "Configurar Cloudflare Tunnel agora? (precisa do dominio ja na Cloudflare) [s/N]"; then
        bash "$DEPLOY_DIR/scripts/cloudflared-setup.sh"
    else
        warn "Cloudflare Tunnel nao configurado. Para fazer depois:"
        warn "  sudo bash $DEPLOY_DIR/scripts/cloudflared-setup.sh"
    fi
fi

# ---------- 6. Cron de backup ----------
banner "Etapa 6/6 - Backup automatico"
CRON_LINE="0 3 * * * $DEPLOY_DIR/scripts/backup.sh >> /var/log/renostter-backup.log 2>&1"
if crontab -l 2>/dev/null | grep -q "renostter-backup"; then
    ok "Cron de backup ja existe"
else
    if ask "Adicionar backup diario as 3h da manha? [s/N]"; then
        (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
        ok "Cron adicionado: 0 3 * * * backup.sh"
    fi
fi

# ---------- Resumo ----------
banner "Deploy concluido!"
cat <<EOF

${GREEN}========================================
  ${NC}URLs disponiveis:${GREEN}
  ========================================${NC}

  ${CYAN}Local (sem DNS):${NC}
    http://localhost:8000/healthz/
    http://localhost:8000/trabalhe-conosco/

  ${CYAN}Com Cloudflare Tunnel configurado:${NC}
    https://carreiras.renostter.com
    https://portainer.renostter.com
    https://status.renostter.com

${YELLOW}Proximos passos:${NC}
  1. Configure DNS autoritativo na Cloudflare (se ainda nao fez)
  2. Aguarde 5-10 min para o tunnel subir
  3. Teste: curl -I https://carreiras.renostter.com/healthz/
  4. Migre dados do Render (se aplicavel):
     bash $DEPLOY_DIR/scripts/migrate-from-render.sh
  5. Acesse https://portainer.renostter.com (crie admin no primeiro acesso)
  6. Importe monitors no https://status.renostter.com

${YELLOW}Comandos uteis:${NC}
  # Status
  cd $DEPLOY_DIR && docker compose ps

  # Logs
  cd $DEPLOY_DIR && docker compose logs -f

  # Backup manual
  bash $DEPLOY_DIR/scripts/backup.sh

  # Atualizar site (depois de git pull)
  cd $DEPLOY_DIR && docker compose build web && docker compose up -d web

EOF
