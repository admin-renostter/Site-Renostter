# ============================================================
# Renostter - Etapa 17: neutralizar o PasswordAuthentication do cloud-init
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\17-cloudinit-ssh.ps1
#
# O culpado apareceu no diagnostico da etapa 16:
#   /etc/ssh/sshd_config.d/50-cloud-init.conf:1:PasswordAuthentication yes
#
# O Include usa glob e le em ordem LEXICAL: 50-cloud-init vem antes de
# 99-renostter. Como a primeira ocorrencia vence, o "yes" do cloud-init ganha.
#
# Meu sed da etapa 16 nao pegou esse arquivo por um bug meu: usei "|" como
# delimitador do s/// E como alternancia dentro do regex, o que trunca o padrao.
#
# Correcao em tres frentes:
#   1. comenta a linha no 50-cloud-init.conf
#   2. renomeia nosso drop-in para 00-renostter.conf (lido PRIMEIRO)
#   3. ssh_pwauth: false no cloud-init, para nao voltar no proximo boot
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "17-cloudinit-ssh.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Conteudo dos drop-ins antes"
RemScript @'
for f in /etc/ssh/sshd_config.d/*.conf; do echo "--- $f ---"; cat "$f"; done
'@

Sec "2. Aplica (destacado)"
$fix = @'
cat > /root/ssh-fix2.sh <<'SCRIPT'
#!/usr/bin/env bash
exec > /var/log/renostter-sshfix2.log 2>&1
set -x
STAMP=$(date +%s)
mkdir -p /root/backup-ssh/$STAMP
cp -a /etc/ssh/sshd_config /etc/ssh/sshd_config.d /root/backup-ssh/$STAMP/

N=$(grep -cE "^(ssh-|ecdsa-)" /root/.ssh/authorized_keys 2>/dev/null || echo 0)
[ "$N" -lt 1 ] && { echo ABORTADO_SEM_CHAVE; exit 1; }

# 1. comenta as diretivas concorrentes nos drop-ins que nao sao nossos
#    (delimitador "/" e sem alternancia - foi ai que eu errei antes)
for f in /etc/ssh/sshd_config.d/*.conf; do
  case "$f" in *renostter*) continue;; esac
  sed -i -E 's/^([[:space:]]*PasswordAuthentication[[:space:]])/#renostter-desativado \1/' "$f"
  sed -i -E 's/^([[:space:]]*PermitRootLogin[[:space:]])/#renostter-desativado \1/' "$f"
  sed -i -E 's/^([[:space:]]*KbdInteractiveAuthentication[[:space:]])/#renostter-desativado \1/' "$f"
done

# 2. nosso arquivo precisa ser lido PRIMEIRO: glob e ordem lexical
if [ -f /etc/ssh/sshd_config.d/99-renostter.conf ]; then
  mv /etc/ssh/sshd_config.d/99-renostter.conf /etc/ssh/sshd_config.d/00-renostter.conf
fi
cat > /etc/ssh/sshd_config.d/00-renostter.conf <<'EOF'
# Lido antes de qualquer outro drop-in: no OpenSSH a primeira ocorrencia vence.
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
chmod 600 /etc/ssh/sshd_config.d/00-renostter.conf

# 3. impede o cloud-init de reescrever isso no proximo boot
mkdir -p /etc/cloud/cloud.cfg.d
cat > /etc/cloud/cloud.cfg.d/99-renostter-ssh.cfg <<'EOF'
# Sem isso o cloud-init recria 50-cloud-init.conf com
# PasswordAuthentication yes a cada boot.
ssh_pwauth: false
EOF

if sshd -t; then
  systemctl reload sshd
  sleep 2
  sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication|kbdinteractiveauthentication)"
  echo SSH_FIX2_OK
else
  echo "sshd -t RECUSOU - revertendo"
  rm -f /etc/ssh/sshd_config.d/*.conf
  cp -a /root/backup-ssh/$STAMP/sshd_config.d/. /etc/ssh/sshd_config.d/
  cp -a /root/backup-ssh/$STAMP/sshd_config /etc/ssh/sshd_config
  systemctl reload sshd
  echo SSH_FIX2_REVERTIDO
fi
SCRIPT
chmod +x /root/ssh-fix2.sh
setsid nohup /root/ssh-fix2.sh < /dev/null > /dev/null 2>&1 &
echo disparado
'@
RemScript $fix

Sec "3. Aguarda"
RemScript @'
for i in $(seq 1 12); do
  sleep 5
  grep -qE "SSH_FIX2_OK|SSH_FIX2_REVERTIDO|ABORTADO" /var/log/renostter-sshfix2.log 2>/dev/null && break
  echo "[$i]..."
done
grep -E "SSH_FIX2_OK|SSH_FIX2_REVERTIDO|ABORTADO|^passwordauthentication|^permitrootlogin|^pubkeyauthentication|^kbdinteractive" /var/log/renostter-sshfix2.log | sed "s/^/  /"
'@

Sec "4. Conexao NOVA + estado efetivo"
$t = & ssh @SSH "root@$VpsIp" "echo CONEXAO_NOVA_OK; sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'; echo '--- ordem dos drop-ins ---'; ls /etc/ssh/sshd_config.d/" 2>&1
$t | ForEach-Object { Write-Host $_ }
if ($t -match "CONEXAO_NOVA_OK") {
    if ($t -match "passwordauthentication no") {
        Write-Host "SENHA DESLIGADA E ACESSO PRESERVADO" -ForegroundColor Green
    } else {
        Write-Host "Acesso ok, mas a senha continua ligada. Me mande o log." -ForegroundColor Yellow
    }
} else {
    Write-Host "SSH QUEBROU. Terminal do painel ICP (2090) e rode:" -ForegroundColor Red
    Write-Host "  cp -a /root/backup-ssh/<timestamp>/sshd_config.d/. /etc/ssh/sshd_config.d/; systemctl reload sshd" -ForegroundColor Yellow
}

Sec "5. fail2ban continua trabalhando?"
RemScript 'fail2ban-client status sshd | sed "s/^/  /"'

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
