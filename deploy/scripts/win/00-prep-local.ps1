# ============================================================
# Renostter - Etapa 0: prepara a chave SSH no Windows
# ============================================================
# Rode no PowerShell (nao precisa de admin):
#   cd "C:\Users\joaop\OneDrive\Documentos\ANTGRAVITY\renostter-site\Site-Renostter\Site-Renostter"
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\00-prep-local.ps1
#
# Tudo que aparecer na tela tambem vai para deploy\logs\00-prep-local.log,
# que eu leio sozinho. Voce nao precisa copiar nada.
# ============================================================

$ErrorActionPreference = "Continue"
$root    = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir  = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log     = Join-Path $logDir "00-prep-local.log"
Start-Transcript -Path $log -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Sec "1. Ambiente"
Write-Host "Data......: $(Get-Date -Format o)"
Write-Host "Usuario...: $env:USERNAME"
Write-Host "Projeto...: $root"

Sec "2. Cliente OpenSSH"
$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if ($ssh) {
    Write-Host "ssh encontrado em: $($ssh.Source)"
    & ssh -V 2>&1 | ForEach-Object { Write-Host "versao: $_" }
} else {
    Write-Host "ssh NAO encontrado. Instale com (PowerShell como Administrador):" -ForegroundColor Red
    Write-Host "  Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0" -ForegroundColor Yellow
}

Sec "3. Chave SSH dedicada da VPS"
New-Item -ItemType Directory -Force -Path (Join-Path $HOME ".ssh") | Out-Null
if (Test-Path $KeyPath) {
    Write-Host "Chave ja existe: $KeyPath (reaproveitando, nada foi sobrescrito)"
} else {
    Write-Host "Gerando chave nova (sem passphrase)..."
    & ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "renostter-vps" 2>&1 | ForEach-Object { Write-Host $_ }
}

if (Test-Path $KeyPath) {
    # Windows recusa a chave se o arquivo estiver legivel por outros usuarios
    & icacls $KeyPath /inheritance:r 2>&1 | Out-Null
    & icacls $KeyPath /grant:r "$($env:USERNAME):(R)" 2>&1 | Out-Null
    Write-Host "Permissoes ajustadas (somente $env:USERNAME le a chave privada)."
}

Sec "4. CHAVE PUBLICA - cole esta linha no painel ICP"
if (Test-Path "$KeyPath.pub") {
    Get-Content "$KeyPath.pub" | ForEach-Object { Write-Host $_ -ForegroundColor Green }
} else {
    Write-Host "ERRO: chave publica nao foi gerada." -ForegroundColor Red
}

Sec "5. Atalho 'renostter' no ~/.ssh/config"
$cfg = Join-Path $HOME ".ssh\config"
if ((Test-Path $cfg) -and (Select-String -Path $cfg -Pattern '^Host renostter$' -Quiet)) {
    Write-Host "Entrada 'renostter' ja existe no config. Conteudo atual:"
    Get-Content $cfg | ForEach-Object { Write-Host "  $_" }
} else {
    $entry = @"

Host renostter
    HostName $VpsIp
    User root
    Port 22
    IdentityFile $KeyPath
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
"@
    Add-Content -Path $cfg -Value $entry -Encoding ascii
    Write-Host "Entrada 'renostter' adicionada. Agora 'ssh renostter' basta."
}

Sec "6. A VPS responde na porta 22?"
try {
    $t = Test-NetConnection -ComputerName $VpsIp -Port 22 -WarningAction SilentlyContinue
    Write-Host "TcpTestSucceeded: $($t.TcpTestSucceeded)"
    Write-Host "RemoteAddress...: $($t.RemoteAddress)"
    if ($t.TcpTestSucceeded) {
        Write-Host "Banner do SSH (identifica o SO):"
        $c = New-Object System.Net.Sockets.TcpClient($VpsIp, 22)
        $c.ReceiveTimeout = 5000
        $sr = New-Object System.IO.StreamReader($c.GetStream())
        Write-Host ("  " + $sr.ReadLine())
        $c.Close()
    }
} catch {
    Write-Host "Falha no teste: $_" -ForegroundColor Yellow
}

Sec "7. Docker / git locais (informativo)"
foreach ($t in @("git","docker","scp","tar")) {
    $c = Get-Command $t -ErrorAction SilentlyContinue
    if ($c) { Write-Host "$t : $($c.Source)" } else { Write-Host "$t : ausente" }
}

Write-Host ""
Write-Host "Pronto. Log salvo em $log" -ForegroundColor Cyan
Write-Host "Volte no chat e me avise - eu leio o log daqui." -ForegroundColor Cyan
Stop-Transcript | Out-Null
