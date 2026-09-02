#!/usr/bin/env bash
# ============================================================
# Renostter - Setup do Cloudflare Tunnel
# ============================================================
# Pré-requisitos:
#   1. Domínio renostter.com já está no Cloudflare (DNS autoritativo)
#   2. Você tem acesso ao painel Cloudflare
#   3. Já rodou hardening.sh (cloudflared instalado)
#
# Uso:
#   bash deploy/scripts/cloudflared-setup.sh
#
# Esse script:
#   1. Autentica com Cloudflare (cloudflared login)
#   2. Cria o tunnel "renostter"
#   3. Salva o credentials.json
#   4. Aplica o config.yml
#   5. Mostra as rotas DNS que precisam ser criadas no painel
# ============================================================

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[setup]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[ATENCAO]${NC} $*"; }
die() { echo -e "${YELLOW}[ERRO]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "Rode como root (sudo bash $0)"

# ---------- 1. Instala cloudflared se faltar ----------
if ! command -v cloudflared >/dev/null; then
    log "Instalando cloudflared..."
    if command -v dnf >/dev/null; then
        # AlmaLinux / RHEL
        curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo \
            > /etc/yum.repos.d/cloudflared.repo
        dnf -y install cloudflared
    elif command -v apt-get >/dev/null; then
        # Debian / Ubuntu
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
            | gpg --dearmor -o /usr/share/keyrings/cloudflare.gpg
        echo "deb [signed-by=/usr/share/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
            > /etc/apt/sources.list.d/cloudflared.list
        apt-get update -qq
        apt-get install -y -qq cloudflared
    else
        die "Nem dnf nem apt-get encontrados - instale o cloudflared manualmente"
    fi
fi
ok "cloudflared $(cloudflared --version 2>&1 | head -1)"

# ---------- 2. Login ----------
CERT_DIR="/root/.cloudflared"
mkdir -p "$CERT_DIR"

if [[ ! -f "$CERT_DIR/cert.pem" ]]; then
    log "Uma URL vai aparecer abaixo. Copie-a INTEIRA e abra no navegador."
    log "(A VPS e headless: nenhuma janela vai abrir sozinha aqui.)"
    log "Escolha a zona renostter.com e autorize."
    log "NAO precisa apertar ENTER: o cloudflared detecta e segue sozinho."
    cloudflared tunnel login
fi
ok "Certificado Cloudflare presente"

# ---------- 3. Cria o tunnel ----------
TUNNEL_NAME="renostter"
TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$0 ~ name {print $1; exit}')
if [[ -z "$TUNNEL_ID" ]]; then
    log "Criando tunnel '$TUNNEL_NAME'..."
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$0 ~ name {print $1; exit}')
fi
[[ -z "$TUNNEL_ID" ]] && die "Falha ao criar/listar tunnel"
ok "Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"

# ---------- 4. Copia credentials para o volume ----------
CREDS_SRC="$CERT_DIR/$TUNNEL_ID.json"
[[ ! -f "$CREDS_SRC" ]] && die "Credentials nao encontrado em $CREDS_SRC"

# O volume do docker compose (cloudflared_data) vai ser criado quando subir.
# Aqui salvamos em /opt/renostter/deploy/cloudflared/ que sera bind-mount.
DEPLOY_DIR="/opt/renostter/deploy"
[[ -d "$DEPLOY_DIR" ]] || die "$DEPLOY_DIR nao existe. Faca o deploy primeiro."

cp "$CREDS_SRC" "$DEPLOY_DIR/cloudflared/$TUNNEL_NAME.json"
# A imagem cloudflare/cloudflared roda como o usuario "nonroot" (uid 65532).
# Com o arquivo em root:root 600 o container le "permission denied" e entra em
# restart loop. Damos a posse ao uid do container e mantemos 600 - assim o
# segredo continua fechado para todos os outros.
chown 65532:65532 "$DEPLOY_DIR/cloudflared/$TUNNEL_NAME.json"
chmod 600 "$DEPLOY_DIR/cloudflared/$TUNNEL_NAME.json"
ok "Credentials copiados para $DEPLOY_DIR/cloudflared/$TUNNEL_NAME.json"

# ---------- 5. Atualiza config.yml com TUNNEL_ID ----------
sed -i "s|^credentials-file: .*|credentials-file: /etc/cloudflared/$TUNNEL_NAME.json|" \
    "$DEPLOY_DIR/cloudflared/config.yml"
sed -i "s|^tunnel: .*|tunnel: $TUNNEL_ID|" \
    "$DEPLOY_DIR/cloudflared/config.yml"

# ---------- 6. Cria as rotas DNS ----------
log "Criando rotas DNS..."
ROUTES=(
    "carreiras.renostter.com"
    "portainer.renostter.com"
    "status.renostter.com"
)

for HOST in "${ROUTES[@]}"; do
    log "  -> $HOST"
    cloudflared tunnel route dns "$TUNNEL_NAME" "$HOST" || warn "  (pode ja existir - OK)"
done
ok "Rotas DNS criadas"

# ---------- 7. Token (apenas informativo) ----------
# A stack roda o tunnel em modo LOCAL (config.yml + credentials-file), que e
# quem define o ingress. O token abaixo so serve caso um dia voce queira
# migrar para o modo "remotely-managed" (configurado pelo painel Cloudflare).
# Definir CLOUDFLARE_TUNNEL_TOKEN no compose faria o cloudflared ignorar o
# ingress local, entao ele NAO e gravado no .env de proposito.
log "Modo local (config.yml) — token do painel nao e necessario."

# ---------- 8. Mostra o que fazer ----------
cat <<EOF

${GREEN}========================================
  Cloudflare Tunnel configurado!
========================================${NC}

Tunnel ID:    $TUNNEL_ID
Nome:         $TUNNEL_NAME
Credentials:  $DEPLOY_DIR/cloudflared/$TUNNEL_NAME.json
Config:       $DEPLOY_DIR/cloudflared/config.yml

${YELLOW}Proximos passos:${NC}
  1. Reinicie a stack: cd $DEPLOY_DIR && docker compose restart cloudflared
  2. Espere ~30s e teste:
     curl -I https://carreiras.renostter.com
     curl -I https://portainer.renostter.com
     curl -I https://status.renostter.com

  3. No painel Cloudflare, voce vera as rotas criadas em:
     Networks > Tunnels > renostter

${YELLOW}IMPORTANTE:${NC}
  - O IP real da VPS NAO fica exposto (DDoS protection)
  - SSL termina no Cloudflare (Nginx interno usa HTTP)
  - Adicione mais rotas editando deploy/cloudflared/config.yml e reiniciando

EOF
