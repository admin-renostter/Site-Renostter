# ============================================================
# Renostter - Etapa 16: desligar de fato a senha no SSH
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\16-ssh-senha-off.ps1
#
# No OpenSSH a PRIMEIRA ocorrencia de cada diretiva vence. O painel ICP deixou
# um "PasswordAuthentication yes" antes do bloco que anexamos no fim, entao o
# nosso e ignorado. Aqui comentamos as ocorrencias anteriores e deixamos as
# nossas como unicas.
#
# Roda destacado: se a conexao cair, o trabalho termina sozinho.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "16-ssh-senha-off.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Onde estao as diretivas hoje"
RemScript @'
echo "-- sshd_config principal --"
grep -nE "^[[:space:]]*(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|Include)" /etc/ssh/sshd_config
echo "-- drop-ins --"
ls -l /etc/ssh/sshd_config.d/ 2>/dev/null || echo "(sem diretorio)"
grep -rnE "^[[:space:]]*(PasswordAuthentication|PermitRootLogin)" /etc/ssh/sshd_config.d/ 2>/dev/null || true
echo "-- efetivo agora --"
sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication)"
'@

Sec "2. Aplica (destacado)"
$fix = @'
cat > /root/ssh-fix.sh <<'SCRIPT'
#!/usr/bin/env bash
exec > /var/log/renostter-sshfix.log 2>&1
set -x
STAMP=$(date +%s)
mkdir -p /root/backup-ssh
cp -a /etc/ssh/sshd_config /root/backup-ssh/sshd_config.$STAMP

# trava: sem chave, nao mexemos
N=$(grep -cE "^(ssh-|ecdsa-)" /root/.ssh/authorized_keys 2>/dev/null || echo 0)
[ "$N" -lt 1 ] && { echo ABORTADO_SEM_CHAVE; exit 1; }

# 1. comenta TODAS as ocorrencias anteriores nos arquivos existentes
sed -i -E "s|^([[:space:]]*(PasswordAuthentication|PermitRootLogin|KbdInteractiveAuthentication|ChallengeResponseAuthentication)[[:space:]].*)$|# renostter-desativado: \1|" /etc/ssh/sshd_config
for f in /etc/ssh/sshd_config.d/*.conf; do
  [ -e "$f" ] || continue
  case "$f" in */99-renostter.conf) continue;; esac
  sed -i -E "s|^([[:space:]]*(PasswordAuthentication|PermitRootLogin)[[:space:]].*)$|# renostter-desativado: \1|" "$f"
done

# 2. garante que o Include existe e vem no TOPO (drop-in tem que ser lido antes)
if ! grep -qE "^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf" /etc/ssh/sshd_config; then
  sed -i "1i Include /etc/ssh/sshd_config.d/*.conf" /etc/ssh/sshd_config
  echo "Include adicionado no topo"
fi

# 3. nosso bloco, agora sem concorrentes
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-renostter.conf <<'EOF'
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
  sleep 2
  sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication)"
  echo SSH_FIX_OK
else
  echo "sshd -t RECUSOU - revertendo tudo"
  cp -a /root/backup-ssh/sshd_config.$STAMP /etc/ssh/sshd_config
  rm -f /etc/ssh/sshd_config.d/99-renostter.conf
  systemctl reload sshd
  echo SSH_FIX_REVERTIDO
fi
SCRIPT
chmod +x /root/ssh-fix.sh
setsid nohup /root/ssh-fix.sh < /dev/null > /dev/null 2>&1 &
echo disparado
'@
RemScript $fix

Sec "3. Aguarda"
RemScript @'
for i in $(seq 1 12); do
  sleep 5
  if grep -qE "SSH_FIX_OK|SSH_FIX_REVERTIDO|ABORTADO_SEM_CHAVE" /var/log/renostter-sshfix.log 2>/dev/null; then break; fi
  echo "[$i]..."
done
grep -E "SSH_FIX_OK|SSH_FIX_REVERTIDO|ABORTADO|passwordauthentication|permitrootlogin|pubkeyauthentication|Include adicionado" /var/log/renostter-sshfix.log | sed "s/^/  /"
'@

Sec "4. Conexao NOVA funciona? (o teste que importa)"
$t = & ssh @SSH "root@$VpsIp" "echo CONEXAO_NOVA_OK; sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'" 2>&1
$t | ForEach-Object { Write-Host $_ }
if ($t -match "CONEXAO_NOVA_OK") {
    Write-Host "ACESSO PRESERVADO" -ForegroundColor Green
} else {
    Write-Host "SSH QUEBROU. Abra o Terminal do painel ICP (porta 2090) e rode:" -ForegroundColor Red
    Write-Host "  cp -a /root/backup-ssh/sshd_config.* /etc/ssh/sshd_config" -ForegroundColor Yellow
    Write-Host "  rm -f /etc/ssh/sshd_config.d/99-renostter.conf; systemctl reload sshd" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
