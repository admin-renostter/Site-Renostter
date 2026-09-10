# ============================================================
# Renostter - Etapa 27: auditoria de seguranca da VPS
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\27-auditoria-seguranca.ps1
#
# SOMENTE LEITURA. Nao instala, nao altera, nao reinicia nada na VPS.
# Gera deploy\logs\27-auditoria-seguranca.log com o inventario completo.
#
# O script remoto vai em BASE64 pelo mesmo motivo das etapas anteriores:
# passar shell script como argumento do ssh faz o texto atravessar
# PowerShell -> ssh -> bash, e cada camada reinterpreta aspas.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "27-auditoria-seguranca.log"
Start-Transcript -Path $log -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)

$sh = Join-Path $root "deploy\scripts\audit-seguranca.sh"
if (-not (Test-Path $sh)) {
    Write-Host "Nao encontrei $sh" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host "Auditando $VpsIp — somente leitura, nada sera alterado." -ForegroundColor Cyan
Write-Host ""

# LF em vez de CRLF: o bash engasga com retorno de carro do Windows
$texto = (Get-Content -Raw -Path $sh) -replace "`r`n", "`n"
$b64   = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($texto))

& ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "A conexao falhou (codigo $LASTEXITCODE). Verifique a chave em $KeyPath." -ForegroundColor Red
}

Write-Host ""
Write-Host "Relatorio salvo em: $log" -ForegroundColor Cyan
Write-Host "Me mande esse arquivo que eu interpreto o resultado." -ForegroundColor Gray
Stop-Transcript | Out-Null
