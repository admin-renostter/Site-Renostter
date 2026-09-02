# ============================================================
# Renostter - Etapa 20: dois consertos definitivos
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\20-final.ps1
#
# PARTE A - nginx: o 502 nao foi acaso.
#   "proxy_pass http://web:8000" resolve o DNS uma unica vez, no carregamento
#   da config. O Docker reiniciou, o web ganhou outro IP, e o nginx continuou
#   batendo no antigo (172.19.0.6) ate ser recriado. Isso voltaria a acontecer
#   a cada reboot. Agora usamos proxy_pass com variavel + resolver 127.0.0.11,
#   que resolve a cada requisicao.
#
# PARTE B - SSH: a senha continua habilitada.
#   /etc/ssh/sshd_config.d/50-cloud-init.conf tem PasswordAuthentication yes e
#   e lido ANTES do nosso 99-renostter.conf (glob = ordem lexical, e a primeira
#   ocorrencia vence). Corrigimos comentando a linha, renomeando nosso arquivo
#   para 00- e desativando ssh_pwauth no cloud-init.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "20-final.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

# ---------------- PARTE A ----------------
Sec "A1. Envia a config nova do nginx"
$tar = Join-Path $env:TEMP "renostter-nginx.tar.gz"
Remove-Item $tar -Force -ErrorAction SilentlyContinue
& tar -czf $tar --exclude="deploy/logs" --exclude="deploy/_backup-pre-fix" -C $root "deploy/nginx" "deploy/docker-compose.yml"
& scp @SSH $tar "root@${VpsIp}:/tmp/ng.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Remove-Item $tar -Force -ErrorAction SilentlyContinue
RemScript @'
cd /opt/renostter
tar xzf /tmp/ng.tar.gz && rm -f /tmp/ng.tar.gz
find deploy/nginx -type f -exec chmod 644 {} +
echo "-- proxy_backend.inc --"; grep -E "proxy_pass|set \$upstream" deploy/nginx/conf.d/proxy_backend.inc
echo "-- resolver --"; grep -n resolver deploy/nginx/conf.d/renostter.conf
'@

Sec "A2. Valida a config ANTES de aplicar"
RemScript @'
cd /opt/renostter/deploy
docker run --rm \
  -v /opt/renostter/deploy/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /opt/renostter/deploy/nginx/conf.d:/etc/nginx/conf.d:ro \
  nginx:1.27-alpine nginx -t 2>&1 | sed "s/^/  /"
'@

Sec "A3. Recria o nginx"
RemScript 'cd /opt/renostter/deploy && docker compose up -d --force-recreate nginx 2>&1 | tail -6; sleep 8'

Sec "A4. Prova real: troca o IP do web e ve se o nginx acompanha"
# Recriar so o web faz ele pegar outro IP. Se o nginx seguir respondendo 200,
# a resolucao dinamica esta funcionando de verdade.
RemScript @'
cd /opt/renostter/deploy
antes=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" renostter-web)
echo "IP do web antes : $antes"
docker compose up -d --force-recreate web 2>&1 | tail -4
sleep 45
depois=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" renostter-web)
echo "IP do web depois: $depois"
for i in $(seq 1 12); do
  c=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -H "Host: carreiras.renostter.com" http://127.0.0.1:8080/healthz/)
  echo "  [$i] healthz local -> HTTP $c"
  [ "$c" = "200" ] && { echo NGINX_ACOMPANHOU_O_IP; break; }
  sleep 10
done
'@

Sec "A5. Rotas publicas"
RemScript @'
for u in https://carreiras.renostter.com/healthz/ \
         https://carreiras.renostter.com/trabalhe-conosco/ \
         https://carreiras.renostter.com/admin/login/ \
         https://carreiras.renostter.com/static/careers/careers.css \
         https://status.renostter.com/ \
         https://portainer.renostter.com/ ; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "$u")
  printf "  %-56s -> HTTP %s\n" "$u" "$c"
done
'@

# ---------------- PARTE B ----------------
Sec "B1. SSH: quem esta mandando hoje"
RemScript @'
grep -rn "PasswordAuthentication" /etc/ssh/sshd_config.d/ /etc/ssh/sshd_config 2>/dev/null | sed "s/^/  /"
echo "  efetivo: $(sshd -T | grep ^passwordauthentication)"
'@

Sec "B2. Aplica (destacado, com reversao automatica)"
$fix = @'
cat > /root/ssh-fix3.sh <<'SCRIPT'
#!/usr/bin/env bash
exec > /var/log/renostter-sshfix3.log 2>&1
set -x
STAMP=$(date +%s); mkdir -p /root/backup-ssh/$STAMP
cp -a /etc/ssh/sshd_config /etc/ssh/sshd_config.d /root/backup-ssh/$STAMP/
N=$(grep -cE "^(ssh-|ecdsa-)" /root/.ssh/authorized_keys 2>/dev/null || echo 0)
[ "$N" -lt 1 ] && { echo ABORTADO_SEM_CHAVE; exit 1; }

for f in /etc/ssh/sshd_config.d/*.conf; do
  case "$f" in *renostter*) continue;; esac
  sed -i -E 's/^([[:space:]]*PasswordAuthentication[[:space:]])/#renostter-desativado \1/' "$f"
  sed -i -E 's/^([[:space:]]*PermitRootLogin[[:space:]])/#renostter-desativado \1/' "$f"
done
rm -f /etc/ssh/sshd_config.d/99-renostter.conf
cat > /etc/ssh/sshd_config.d/00-renostter.conf <<'EOF'
# 00- para ser lido antes dos outros: a primeira ocorrencia vence.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
EOF
chmod 600 /etc/ssh/sshd_config.d/00-renostter.conf
mkdir -p /etc/cloud/cloud.cfg.d
printf 'ssh_pwauth: false\n' > /etc/cloud/cloud.cfg.d/99-renostter-ssh.cfg

if sshd -t; then
  systemctl reload sshd; sleep 2
  sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication)"
  echo SSH_OK
else
  rm -f /etc/ssh/sshd_config.d/*.conf
  cp -a /root/backup-ssh/$STAMP/sshd_config.d/. /etc/ssh/sshd_config.d/
  cp -a /root/backup-ssh/$STAMP/sshd_config /etc/ssh/sshd_config
  systemctl reload sshd
  echo SSH_REVERTIDO
fi
SCRIPT
chmod +x /root/ssh-fix3.sh
setsid nohup /root/ssh-fix3.sh < /dev/null > /dev/null 2>&1 &
echo disparado
'@
RemScript $fix

Sec "B3. Resultado"
RemScript @'
for i in $(seq 1 12); do
  sleep 5
  grep -qE "SSH_OK|SSH_REVERTIDO|ABORTADO" /var/log/renostter-sshfix3.log 2>/dev/null && break
done
grep -E "SSH_OK|SSH_REVERTIDO|ABORTADO|^passwordauthentication|^permitrootlogin|^pubkeyauthentication" /var/log/renostter-sshfix3.log | sed "s/^/  /"
'@

Sec "B4. Conexao NOVA (o teste que importa)"
$t = & ssh @SSH "root@$VpsIp" "echo CONEXAO_NOVA_OK; sshd -T | grep ^passwordauthentication" 2>&1
$t | ForEach-Object { Write-Host $_ }
if ($t -match "CONEXAO_NOVA_OK" -and $t -match "passwordauthentication no") {
    Write-Host "SENHA DESLIGADA E ACESSO PRESERVADO" -ForegroundColor Green
} elseif ($t -match "CONEXAO_NOVA_OK") {
    Write-Host "Acesso ok, mas a senha continua ligada." -ForegroundColor Yellow
} else {
    Write-Host "SSH quebrou. Terminal do painel ICP (porta 2090):" -ForegroundColor Red
    Write-Host "  cp -a /root/backup-ssh/*/sshd_config.d/. /etc/ssh/sshd_config.d/; systemctl reload sshd" -ForegroundColor Yellow
}

Sec "Estado final"
RemScript @'
cd /opt/renostter/deploy && docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo; echo -n "fail2ban: "; systemctl is-active fail2ban
fail2ban-client status sshd 2>/dev/null | grep -E "Currently banned|Total banned" | sed "s/^/  /"
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
