#!/usr/bin/env bash
# ============================================================
# Renostter - Hardening para AlmaLinux / RHEL 9 (VPS Integrator ICP)
# ============================================================
# Equivalente ao hardening.sh (Ubuntu), adaptado para:
#   dnf   em vez de apt-get
#   firewalld em vez de ufw
#   dnf-automatic em vez de unattended-upgrades
#   SELinux ativo (nao desligamos - o compose usa :z e label:disable)
#
# Esta VPS roda o painel ICP (1Panel). O script NAO mexe no painel:
#   - preserva a porta do painel no firewall
#   - nao reinstala nem reconfigura o Docker que o painel gerencia
#
# Uso:
#   sudo bash deploy/scripts/hardening-el.sh
#   sudo PANEL_PORT=2090 bash deploy/scripts/hardening-el.sh
# ============================================================

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
banner() { echo; echo -e "${CYAN}==== $* ====${NC}"; }
log()  { echo -e "${CYAN}[hardening]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[ATENCAO]${NC} $*"; }
die()  { echo -e "${RED}[ERRO]${NC} $*"; exit 1; }
ask()  { read -r -p "$(echo -e "${YELLOW}?${NC} $1 ")" r; [[ "$r" =~ ^([sSyY]|sim|SIM|yes)$ ]]; }

[[ $EUID -ne 0 ]] && die "Rode como root (sudo bash $0)"
command -v dnf >/dev/null || die "dnf nao encontrado. Este script e para AlmaLinux/RHEL. Para Ubuntu use hardening.sh."

PANEL_PORT="${PANEL_PORT:-2090}"
SSH_PORT="${SSH_PORT:-22}"

banner "0/8  Situacao atual"
source /etc/os-release 2>/dev/null || true
log "SO........: ${PRETTY_NAME:-desconhecido}"
log "Kernel....: $(uname -r)"
log "SELinux...: $(getenforce 2>/dev/null || echo 'ausente')"
log "Porta SSH.: $SSH_PORT | Porta painel: $PANEL_PORT"
echo
log "Portas em escuta agora:"
ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | head -25 || true

banner "1/8  Trava de seguranca: a chave SSH esta instalada?"
# Sem isso, desligar a senha do SSH te tranca para fora da VPS.
AUTH="/root/.ssh/authorized_keys"
if [[ ! -s "$AUTH" ]]; then
    die "$AUTH esta vazio ou nao existe.
     Rode a etapa 01-bootstrap-vps.ps1 no Windows ANTES deste script.
     Desligar a senha do SSH agora te deixaria sem acesso nenhum."
fi
NKEYS=$(grep -cE '^(ssh-|ecdsa-)' "$AUTH" || echo 0)
[[ "$NKEYS" -lt 1 ]] && die "Nenhuma chave valida em $AUTH."
ok "$NKEYS chave(s) instalada(s) em $AUTH"

banner "2/8  Atualizacoes do sistema"
if ask "Rodar 'dnf update' agora? Pode demorar alguns minutos. [s/N]"; then
    dnf -y update
    ok "Sistema atualizado"
else
    warn "Update pulado"
fi

banner "3/8  Pacotes de seguranca"
dnf -y install epel-release || warn "EPEL ja presente ou indisponivel"
dnf -y install fail2ban firewalld policycoreutils-python-utils \
               dnf-automatic chrony tar bzip2 jq || warn "Alguns pacotes falharam - veja acima"
ok "Pacotes instalados"

banner "4/8  Atualizacoes automaticas de seguranca"
# Equivalente ao unattended-upgrades do Ubuntu
if [[ -f /etc/dnf/automatic.conf ]]; then
    sed -i 's/^upgrade_type.*/upgrade_type = security/'   /etc/dnf/automatic.conf
    sed -i 's/^apply_updates.*/apply_updates = yes/'      /etc/dnf/automatic.conf
    systemctl enable --now dnf-automatic.timer
    ok "dnf-automatic ativo (somente updates de seguranca)"
else
    warn "/etc/dnf/automatic.conf nao encontrado - pulei"
fi

banner "5/8  Firewall (firewalld)"
systemctl enable --now firewalld
ZONE=$(firewall-cmd --get-default-zone)
log "Zona padrao: $ZONE"
log "Regras atuais: $(firewall-cmd --zone="$ZONE" --list-all | tr '\n' ' ')"
echo
log "Garantindo SSH ($SSH_PORT) e painel ICP ($PANEL_PORT) abertos..."
firewall-cmd --permanent --zone="$ZONE" --add-port="${SSH_PORT}/tcp"   >/dev/null
firewall-cmd --permanent --zone="$ZONE" --add-port="${PANEL_PORT}/tcp" >/dev/null
firewall-cmd --reload
ok "SSH e painel liberados"

echo
warn "SOBRE AS PORTAS 80 e 443:"
warn "  O nginx do painel ICP (container ic-nginx) ESTA escutando nas duas,"
warn "  e o painel tem 1 dominio e 1 certificado SSL configurados."
warn "  A nossa stack NAO usa a 80 do host - o Cloudflare Tunnel fala direto"
warn "  com o container. Ou seja: fechar a 80/443 nao afeta o Renostter,"
warn "  mas DERRUBA o que o painel estiver servindo por elas."
echo
if ask "Fechar 80 e 443 mesmo assim? Responda N se usa algum site pelo painel. [s/N]"; then
    firewall-cmd --permanent --zone="$ZONE" --remove-service=http  2>/dev/null || true
    firewall-cmd --permanent --zone="$ZONE" --remove-service=https 2>/dev/null || true
    firewall-cmd --permanent --zone="$ZONE" --remove-port=80/tcp   2>/dev/null || true
    firewall-cmd --permanent --zone="$ZONE" --remove-port=443/tcp  2>/dev/null || true
    firewall-cmd --reload
    ok "80 e 443 fechadas"
else
    ok "80 e 443 mantidas abertas (painel ICP continua servindo)"
fi

firewall-cmd --permanent --zone="$ZONE" --remove-service=cockpit 2>/dev/null || true
firewall-cmd --reload
echo
log "Estado final do firewall:"
firewall-cmd --zone="$ZONE" --list-all
echo
warn "NOTA: o Docker escreve regras proprias em iptables e passa por cima do"
warn "firewalld para portas publicadas. Por isso o compose publica tudo em"
warn "127.0.0.1 - o firewalld nao e a unica linha de defesa."

banner "6/8  fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 24h
findtime = 10m
maxretry = 3
backend  = systemd
banaction = firewallcmd-ipset
# Nao se autobloqueie se administrar de um IP fixo: acrescente-o aqui.
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban
sleep 2
fail2ban-client status sshd 2>/dev/null || warn "jail sshd ainda subindo"
ok "fail2ban ativo (3 tentativas = 24h de ban)"

banner "7/8  SSH: desliga senha, mantem chave"
BACKUP="/root/sshd_config.d-backup-$(date +%s)"
mkdir -p /etc/ssh/sshd_config.d "$BACKUP"
cp -a /etc/ssh/sshd_config "$BACKUP/" 2>/dev/null || true
warn "Depois disso, SO a chave funciona. Senha de root deixa de valer no SSH."
warn "Sua chave ja foi validada no passo 1, e o painel ICP continua sendo"
warn "a sua porta de emergencia se algo der errado."
if ask "Aplicar? [s/N]"; then
    cat > /etc/ssh/sshd_config.d/99-renostter.conf <<'EOF'
# Renostter - endurecimento do SSH
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    if sshd -t; then
        systemctl reload sshd
        ok "SSH endurecido (backup em $BACKUP)"
        warn "NAO FECHE esta sessao ainda. Abra outra janela e confirme:"
        warn "   ssh renostter \"echo ok\""
        warn "Se falhar: nesta sessao rode  rm /etc/ssh/sshd_config.d/99-renostter.conf && systemctl reload sshd"
    else
        rm -f /etc/ssh/sshd_config.d/99-renostter.conf
        die "sshd -t recusou a config. Nada foi aplicado."
    fi
else
    warn "SSH nao alterado - a senha de root continua valendo"
fi

banner "8/8  Kernel (sysctl)"
cat > /etc/sysctl.d/99-renostter.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
fs.file-max = 65535
vm.swappiness = 10
EOF
sysctl --system >/dev/null 2>&1 || warn "sysctl reclamou - veja com: sysctl --system"
ok "sysctl aplicado"

banner "Extra  Rotacao de log do Docker"
# Sem isso os logs de container enchem o disco em algumas semanas.
if [[ -f /etc/docker/daemon.json ]] && grep -q "max-size" /etc/docker/daemon.json 2>/dev/null; then
    ok "Rotacao ja configurada"
else
    warn "O Docker desta VPS e gerenciado pelo painel ICP."
    warn "Aplicar rotacao exige reiniciar o Docker, o que REINICIA os containers do painel."
    if ask "Configurar agora? (recomendado, mas escolha uma hora calma) [s/N]"; then
        mkdir -p /etc/docker
        cp -a /etc/docker/daemon.json "/root/daemon.json.bak-$(date +%s)" 2>/dev/null || true
        if [[ -f /etc/docker/daemon.json ]] && command -v jq >/dev/null; then
            jq '. + {"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"5"}}' \
               /etc/docker/daemon.json > /tmp/daemon.json && mv /tmp/daemon.json /etc/docker/daemon.json
        else
            cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
EOF
        fi
        systemctl restart docker && ok "Rotacao de log ativa"
    else
        warn "Pulado - lembre de fazer depois"
    fi
fi

banner "Resumo"
echo
ok "Hardening concluido."
echo
echo "  Firewall  : $(firewall-cmd --zone="$(firewall-cmd --get-default-zone)" --list-ports 2>/dev/null || echo '?')"
echo "  fail2ban  : $(systemctl is-active fail2ban)"
echo "  SELinux   : $(getenforce 2>/dev/null)"
echo "  SSH senha : $(grep -h '^PasswordAuthentication' /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 || echo 'padrao')"
echo
warn "ANTES DE FECHAR: abra outra janela e teste  ssh renostter \"echo ok\""
echo
