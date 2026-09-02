# ============================================================
# Renostter - Etapa 1: instala a chave na VPS e faz o inventario
# ============================================================
# Rode DEPOIS de reinstalar a VPS (ou agora mesmo, se decidir nao reinstalar):
#   cd "C:\Users\joaop\OneDrive\Documentos\ANTGRAVITY\renostter-site\Site-Renostter\Site-Renostter"
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\01-bootstrap-vps.ps1
#
# Ele pede a senha de root UMA vez (a do e-mail da Integrator). A senha nao
# aparece na tela nem entra no log. Depois disso o acesso passa a ser por chave.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log    = Join-Path $logDir "01-bootstrap-vps.log"
Start-Transcript -Path $log -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$PubPath = "$KeyPath.pub"

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Sec "0. Pre-checagem"
if (-not (Test-Path $PubPath)) {
    Write-Host "ERRO: chave publica nao existe. Rode 00-prep-local.ps1 primeiro." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}
$pub = (Get-Content $PubPath -Raw).Trim()
Write-Host "Chave: $pub"

Sec "1. Limpa host key antiga"
# Se a VPS foi reinstalada, a identidade do servidor mudou e o ssh recusa conectar.
& ssh-keygen -R $VpsIp 2>&1 | ForEach-Object { Write-Host $_ }
& ssh-keygen -R "vps11226.panel.icontainer.net" 2>&1 | Out-Null

Sec "2. Instala a chave publica no root da VPS"
# Primeiro checa se a chave JA funciona (por exemplo, se voce a colou pelo
# terminal web do painel ICP). Se funcionar, nao ha senha a digitar.
$pre = & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i $KeyPath "root@$VpsIp" "echo JA_TEM_CHAVE" 2>&1
if ($pre -match "JA_TEM_CHAVE") {
    Write-Host "A chave ja esta instalada na VPS. Pulando a etapa de senha." -ForegroundColor Green
} else {
    Write-Host "Vai pedir a SENHA DE ROOT (a do e-mail 'Dados de Acesso VPS ICP')." -ForegroundColor Yellow
    Write-Host "Digite e pressione Enter. Ela nao aparece na tela - isso e normal." -ForegroundColor Yellow
    Write-Host ""
    $remote = "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; grep -qxF '$pub' ~/.ssh/authorized_keys || echo '$pub' >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; echo CHAVE_INSTALADA_OK"
    & ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no "root@$VpsIp" $remote 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "3. Testa login SOMENTE por chave"
$test = & ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $KeyPath "root@$VpsIp" "echo LOGIN_POR_CHAVE_OK" 2>&1
$test | ForEach-Object { Write-Host $_ }
if (-not ($test -match "LOGIN_POR_CHAVE_OK")) {
    Write-Host ""
    Write-Host "A chave nao foi aceita. Nao vou continuar o inventario." -ForegroundColor Red
    Write-Host "Me avise no chat - o log tem o motivo." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

Sec "4. Inventario da VPS"
# Tudo que eu preciso saber antes de escrever o deploy definitivo:
# qual SO de fato, quem ja ocupa a porta 80, se o Docker esta la, e quanto sobra.
$inv = @'
echo "----- SO -----"
cat /etc/os-release 2>/dev/null | head -8
echo "----- KERNEL -----"; uname -srm
echo "----- GERENCIADOR DE PACOTES -----"
for c in apt-get dnf yum ufw firewall-cmd systemctl; do printf "%-12s " "$c"; command -v $c || echo "ausente"; done
echo "----- PORTAS EM ESCUTA -----"
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | head -40
echo "----- DOCKER -----"
docker --version 2>/dev/null || echo "docker ausente"
docker compose version 2>/dev/null || echo "compose plugin ausente"
echo "-- containers --"; docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -30
echo "----- DISCO / MEMORIA -----"; df -h / /var 2>/dev/null; free -h
echo "----- SERVICOS ATIVOS -----"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | cut -d" " -f1 | head -30
echo "----- SELINUX -----"; getenforce 2>/dev/null || echo "sem selinux"
echo "----- FIM -----"
'@

& ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $KeyPath "root@$VpsIp" $inv 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Pronto. Log em $log" -ForegroundColor Cyan
Write-Host "Me avise no chat que eu leio daqui e escrevo o deploy em cima do que achei." -ForegroundColor Cyan
Stop-Transcript | Out-Null
