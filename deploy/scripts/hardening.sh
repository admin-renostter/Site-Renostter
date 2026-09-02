#!/usr/bin/env bash
# ============================================================
# Renostter - Hardening da VPS
# ============================================================
# Uso: sudo bash deploy/scripts/hardening.sh
#
# O que faz:
#   1. Atualiza o sistema
#   2. Configura unattended-upgrades
#   3. Configura UFW (firewall)
#   4. Instala e configura fail2ban
#   5. Reforça SSH (chave obrigatória, sem root login)
#   6. Instala utilitários úteis (htop, ncdu, etc)
#   7. Configura sysctl (proteção básica)
# ============================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "ERRO: rode como root (sudo bash $0)"
    exit 1
fi

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
banner() { echo -e "\n${CYAN}== $1 ==${NC}"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ATENCAO]${NC} $1"; }

banner "1/7  Atualizando o sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    ufw fail2ban unattended-upgrades apt-listchanges \
    curl wget git htop ncdu tmux vim \
    net-tools ca-certificates gnupg lsb-release
ok "Sistema atualizado"

banner "2/7  unattended-upgrades (atualizacoes automaticas de seguranca)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Download-Upgradeable-Packages "1";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "root";
EOF
ok "Atualizacoes automaticas configuradas"

banner "3/7  UFW (firewall)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
# SSH: unica porta que precisa aceitar conexao de fora.
ufw allow 22/tcp comment "SSH"
# O cloudflared abre conexao DE DENTRO para a 7844 do Cloudflare. Isso e
# trafego de saida (ja liberado por "default allow outgoing"), entao nao
# existe regra de entrada a criar.
# A 80 NAO e liberada: o nginx faz bind so em 127.0.0.1 e quem entrega o
# trafego e o tunnel. Abrir a 80 deixaria o site acessivel pelo IP cru,
# contornando o WAF/DDoS do Cloudflare.
systemctl enable ufw
ufw --force enable
ok "UFW ativo: $(ufw status | head -1)"

banner "4/7  fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
backend = systemd
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
maxretry = 3
bantime = 24h
EOF
systemctl enable fail2ban
systemctl restart fail2ban
ok "fail2ban ativo (3 tentativas = ban 24h)"

banner "5/7  SSH reforcado"
SSHD_CONFIG="/etc/ssh/sshd_config"
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

cat > "$SSHD_CONFIG" <<'EOF'
Port 22
AddressFamily inet
Protocol 2

# Autenticacao
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
AuthenticationMethods publickey
MaxAuthTries 3
MaxSessions 3
LoginGraceTime 30

# Seguranca
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitUserEnvironment no
UsePAM yes

# Limites
ClientAliveInterval 300
ClientAliveCountMax 2

# Banner
Banner /etc/issue.net
EOF

# Banner dissuasivo
cat > /etc/issue.net <<'EOF'
***************************************************************************
*                         ACESSO RESTRITO                                  *
* Apenas usuarios autorizados. Todas as atividades sao monitoradas.        *
***************************************************************************
EOF

# Aviso: se voce ainda nao tem chave SSH, vai perder o acesso
if [[ ! -f /root/.ssh/authorized_keys ]] && [[ ! -f /home/*/.ssh/authorized_keys ]]; then
    warn "Nenhuma chave SSH encontrada em /root/.ssh nem em /home/*/.ssh"
    warn "ANTES de desconectar, adicione sua chave publica em:"
    warn "  mkdir -p ~/.ssh && chmod 700 ~/.ssh"
    warn "  echo 'sua-chave-publica-aqui' >> ~/.ssh/authorized_keys"
    warn "  chmod 600 ~/.ssh/authorized_keys"
    read -p "Ja adicionou a chave? (s/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        warn "Abortando para voce adicionar a chave primeiro."
        exit 1
    fi
fi

systemctl reload ssh
ok "SSH reforcado (sem senha, sem root, apenas chave)"

banner "6/7  sysctl (protecao de rede)"
cat > /etc/sysctl.d/99-renostter.conf <<'EOF'
# Anti-spoofing
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Sem ICMP redirect
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

# Sem source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Logs de pacotes suspeitos
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
EOF
sysctl -p /etc/sysctl.d/99-renostter.conf
ok "sysctl aplicado"

banner "7/7  Instalando Docker (se nao estiver)"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    ok "Docker instalado"
else
    ok "Docker ja esta instalado ($(docker --version))"
fi

if ! command -v docker compose &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi
docker compose version >/dev/null && ok "Docker Compose $(docker compose version)"

banner "Resumo"
cat <<EOF

${GREEN}========================================
  Hardening concluido com sucesso
========================================${NC}

  Sistema:        atualizado e upgrades automaticos ativos
  Firewall (UFW): apenas 22, 80, 7844 abertos
  fail2ban:       3 tentativas = ban 24h
  SSH:            apenas chave publica, sem root
  Docker:         $(docker --version 2>/dev/null || echo "verificar")

${YELLOW}Proximo passo:${NC}
  1. Copie os arquivos do projeto para a VPS:
     scp -r renostter-site/ usuario@vps:/opt/renostter
  2. Entre na VPS: ssh usuario@vps
  3. Siga o guia: docs/DEPLOY_VPS_INTEGRATOR.md

EOF
