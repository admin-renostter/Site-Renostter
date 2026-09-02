# ============================================================
# Renostter - Etapa 15: conclui o hardening (fail2ban, SSH, sysctl)
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\15-hardening-resto.ps1
#
# O hardening anterior morreu no passo 5/8 porque o "firewall-cmd --reload"
# derruba conexoes estabelecidas - inclusive a propria sessao SSH.
#
# Aqui o script roda DESTACADO no servidor (setsid + nohup) gravando em
# /var/log/renostter-hardening.log. Se a conexao cair de novo, o trabalho
# continua sozinho e a gente so le o log depois.
#
# Decisoes ja tomadas: 80/443 ficam ABERTAS (nginx do painel ICP usa as duas).
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "15-hardening-resto.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. O que ja esta feito"
RemScript @'
echo -n "fail2ban : "; systemctl is-active fail2ban 2>/dev/null || echo inativo
echo -n "dnf-auto : "; systemctl is-active dnf-automatic.timer 2>/dev/null || echo inativo
echo -n "sshd drop-in: "; ls /etc/ssh/sshd_config.d/99-renostter.conf 2>/dev/null || echo ausente
echo -n "sysctl   : "; ls /etc/sysctl.d/99-renostter.conf 2>/dev/null || echo ausente
echo "firewall :"; firewall-cmd --list-all | sed "s/^/   /"
echo -n "chaves em authorized_keys: "; grep -cE "^(ssh-|ecdsa-)" /root/.ssh/authorized_keys
'@

Sec "2. Envia o script e roda DESTACADO"
$h = @'
cat > /root/hardening-resto.sh <<'SCRIPT'
#!/usr/bin/env bash
exec > /var/log/renostter-hardening.log 2>&1
set -x
echo "== inicio: $(date) =="

# ---------- trava: sem chave SSH, nao mexemos em autenticacao ----------
N=$(grep -cE "^(ssh-|ecdsa-)" /root/.ssh/authorized_keys 2>/dev/null || echo 0)
if [ "$N" -lt 1 ]; then
  echo "ABORTADO: nenhuma chave em authorized_keys"
  exit 1
fi
echo "chaves encontradas: $N"

# ---------- fail2ban ----------
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime   = 24h
findtime  = 10m
maxretry  = 3
backend   = systemd
banaction = firewallcmd-ipset
ignoreip  = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban
sleep 3
fail2ban-client status
fail2ban-client status sshd

# ---------- SSH ----------
# O painel ICP pode ter reescrito o sshd_config. Só usamos drop-in se o
# Include existir; caso contrario escrevemos no arquivo principal.
mkdir -p /root/backup-ssh
cp -a /etc/ssh/sshd_config /root/backup-ssh/sshd_config.$(date +%s)

CONF=/etc/ssh/sshd_config.d/99-renostter.conf
if grep -qE "^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf" /etc/ssh/sshd_config; then
  mkdir -p /etc/ssh/sshd_config.d
  echo "usando drop-in: $CONF"
else
  CONF=/etc/ssh/sshd_config
  echo "sem Include no sshd_config - anexando no arquivo principal"
fi

cat >> "$CONF" <<'EOF'

# Renostter - endurecimento do SSH
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

if sshd -t; then
  systemctl reload sshd
  echo "SSH endurecido com sucesso"
else
  echo "sshd -t RECUSOU a config - revertendo"
  if [ "$CONF" = "/etc/ssh/sshd_config" ]; then
    cp -a /root/backup-ssh/sshd_config.* /etc/ssh/sshd_config
  else
    rm -f "$CONF"
  fi
  systemctl reload sshd
fi

# ---------- sysctl ----------
cat > /etc/sysctl.d/99-renostter.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
vm.swappiness = 10
EOF
sysctl --system > /dev/null
echo "sysctl aplicado"

# ---------- rotacao de log do Docker ----------
# Escrevemos o daemon.json mas NAO reiniciamos o Docker: isso derrubaria a
# stack e os containers do painel. Passa a valer no proximo restart/reboot.
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
  echo "daemon.json criado (efetivo no proximo restart do Docker)"
else
  echo "daemon.json ja existia - nao mexi"
fi

# ---------- cron de backup ----------
if ! crontab -l 2>/dev/null | grep -q renostter; then
  (crontab -l 2>/dev/null; echo "0 3 * * * /opt/renostter/deploy/scripts/backup.sh >> /var/log/renostter-backup.log 2>&1") | crontab -
  echo "cron de backup diario as 3h adicionado"
fi

echo "== fim: $(date) =="
echo "HARDENING_CONCLUIDO"
SCRIPT
chmod +x /root/hardening-resto.sh
setsid nohup /root/hardening-resto.sh < /dev/null > /dev/null 2>&1 &
echo "disparado em segundo plano"
'@
RemScript $h

Sec "3. Acompanha (o SSH pode cair; o script continua sozinho)"
$wait = @'
for i in $(seq 1 20); do
  sleep 8
  if grep -q "HARDENING_CONCLUIDO" /var/log/renostter-hardening.log 2>/dev/null; then
    echo CONCLUIDO; break
  fi
  echo "[$i] rodando..."
done
'@
RemScript $wait

Sec "4. Resultado"
RemScript @'
echo "----- trechos relevantes do log -----"
grep -E "chaves encontradas|SSH endurecido|RECUSOU|sysctl aplicado|daemon.json|cron|Status|Banned|ABORTADO|HARDENING_CONCLUIDO" /var/log/renostter-hardening.log | sed "s/^/  /"
echo
echo "----- estado final -----"
echo -n "fail2ban : "; systemctl is-active fail2ban
fail2ban-client status sshd 2>/dev/null | sed "s/^/   /"
echo -n "senha SSH: "; sshd -T 2>/dev/null | grep -E "^passwordauthentication|^permitrootlogin" | sed "s/^/ /" | tr "\n" " "; echo
echo "firewall :"; firewall-cmd --list-all | sed "s/^/   /"
'@

Sec "5. O SSH ainda funciona? (teste independente)"
$t = & ssh @SSH "root@$VpsIp" "echo SSH_AINDA_OK" 2>&1
$t | ForEach-Object { Write-Host $_ }
if ($t -match "SSH_AINDA_OK") {
    Write-Host "ACESSO PRESERVADO" -ForegroundColor Green
} else {
    Write-Host "ATENCAO: o SSH nao respondeu. Use o Terminal do painel ICP e rode:" -ForegroundColor Red
    Write-Host "  rm -f /etc/ssh/sshd_config.d/99-renostter.conf; systemctl reload sshd" -ForegroundColor Yellow
}

Sec "6. A stack continua no ar?"
RemScript @'
cd /opt/renostter/deploy && docker compose ps --format "table {{.Name}}\t{{.Status}}"
curl -s -o /dev/null -m 15 -w "healthz local -> HTTP %{http_code}\n" -H "Host: carreiras.renostter.com" http://127.0.0.1:8080/healthz/
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
