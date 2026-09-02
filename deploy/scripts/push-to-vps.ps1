# ============================================================
# Renostter - Envia arquivos do Windows para a VPS via SCP
# ============================================================
# Uso (do PowerShell, na pasta raiz do projeto):
#   .\deploy\scripts\push-to-vps.ps1 -VpsHost ubuntu@123.45.67.89
#
# Com porta customizada:
#   .\deploy\scripts\push-to-vps.ps1 -VpsHost ubuntu@123.45.67.89 -Port 2222
#
# O que faz:
#   1. Valida que a pasta deploy existe
#   2. Sobe deploy/ + django-trabalhe-conosco/ para /tmp/ na VPS
#   3. (Opcional) Cria /opt/renostter e move os arquivos
#   4. Mostra o comando para voce executar na VPS
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$VpsHost,

    [int]$Port = 22,

    [string]$RemotePath = "/opt/renostter",

    [string]$LocalRoot = (Resolve-Path "$PSScriptRoot/../..")
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Renostter - Push para VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- Validacoes ----------
$deployPath = Join-Path $LocalRoot "deploy"
$djangoPath = Join-Path $LocalRoot "django-trabalhe-conosco"

if (-not (Test-Path $deployPath)) {
    Write-Host "ERRO: pasta deploy nao encontrada em $deployPath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $djangoPath)) {
    Write-Host "ERRO: pasta django-trabalhe-conosco nao encontrada em $djangoPath" -ForegroundColor Red
    exit 1
}

Write-Host "Origem: $LocalRoot" -ForegroundColor Gray
Write-Host "Destino: ${VpsHost}:${RemotePath}" -ForegroundColor Gray
Write-Host "Porta: $Port" -ForegroundColor Gray
Write-Host ""

# ---------- Cria o .env se nao existir ----------
$envPath = Join-Path $deployPath ".env"
$envExamplePath = Join-Path $deployPath ".env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envPath
        Write-Host "[AVISO] .env criado a partir de .env.example" -ForegroundColor Yellow
        Write-Host "[AVISO] EDITE o arquivo ANTES de subir a stack:" -ForegroundColor Yellow
        Write-Host "  notepad $envPath" -ForegroundColor Yellow
        Write-Host ""
        $resp = Read-Host "Continuar mesmo assim? (s/N)"
        if ($resp -notin @("s", "S", "y", "Y", "sim", "SIM", "yes", "YES")) {
            Write-Host "Cancelado. Edite o .env e rode novamente." -ForegroundColor Yellow
            exit 0
        }
    } else {
        Write-Host "ERRO: .env nem .env.example encontrados" -ForegroundColor Red
        exit 1
    }
}

# ---------- Garante que o .env NAO vai com secrets reais ----------
# (Acao preventiva - o user deve editar DEPOIS na VPS)
$envContent = Get-Content $envPath -Raw
if ($envContent -match "troque-por-senha-forte") {
    Write-Host "[ATENCAO] .env ainda tem placeholders. Lembre de editar na VPS depois." -ForegroundColor Yellow
}

# ---------- SCP ----------
Write-Host "Enviando arquivos para a VPS..." -ForegroundColor Cyan
Write-Host "(pode pedir senha varias vezes - normal)" -ForegroundColor Gray
Write-Host ""

# Sobe a pasta deploy primeiro
Write-Host "[1/3] deploy/" -ForegroundColor Cyan
scp -P $Port -r $deployPath "${VpsHost}:${RemotePath}/deploy/" 2>&1 | ForEach-Object {
    if ($_ -match "password:") { return }
    Write-Host "  $_"
}

# Sobe a pasta django
Write-Host ""
Write-Host "[2/3] django-trabalhe-conosco/ (sem .venv, .env, db.sqlite3)" -ForegroundColor Cyan
# Usa tar pra evitar subir .venv (muito grande). Compacta no Windows, descompacta na VPS.
$tempTar = Join-Path $env:TEMP "django-trabalhe-conosco-$(Get-Date -Format yyyyMMddHHmmss).tar.gz"

# Lista o que NAO vai entrar
$exclude = @(".venv", ".env", ".env.local", ".env.production", "db.sqlite3", "private_media", "lancedb", "audit", "logs", "__pycache__", ".vscode", ".idea", ".pytest_cache")

Write-Host "  Compactando (excluindo: $($exclude -join ', '))..." -ForegroundColor Gray
# Usa tar do Git (se existir) ou do Windows
$tarCmd = Get-Command tar -ErrorAction SilentlyContinue
if (-not $tarCmd) {
    Write-Host "ERRO: 'tar' nao encontrado. Instale Git for Windows ou use WSL." -ForegroundColor Red
    exit 1
}

# Compacta
$djangoName = Split-Path $djangoPath -Leaf
$parentDir = Split-Path $djangoPath -Parent
Push-Location $parentDir
try {
    $excludeArgs = $exclude | ForEach-Object { "--exclude=$_" }
    & tar -czf $tempTar @excludeArgs -C $parentDir $djangoName 2>&1 | Out-Null
} finally {
    Pop-Location
}

$tarSize = (Get-Item $tempTar).Length / 1MB
Write-Host "  Arquivo: $tempTar ($([math]::Round($tarSize, 1)) MB)" -ForegroundColor Gray

# Sobe
scp -P $Port $tempTar "${VpsHost}:/tmp/django-trabalhe-conosco.tar.gz" 2>&1 | ForEach-Object {
    if ($_ -match "password:") { return }
    Write-Host "  $_"
}

# ---------- Comandos para rodar na VPS ----------
Write-Host ""
Write-Host "[3/3] Agora conecte na VPS e execute:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ssh -p $Port $VpsHost" -ForegroundColor White
Write-Host ""
Write-Host "Depois, na VPS:" -ForegroundColor White
Write-Host ""
Write-Host "  # Cria a estrutura" -ForegroundColor Gray
Write-Host "  sudo mkdir -p $RemotePath" -ForegroundColor White
Write-Host "  sudo chown -R \`$USER:\`$USER $RemotePath" -ForegroundColor White
Write-Host ""
Write-Host "  # Descompacta o Django" -ForegroundColor Gray
Write-Host "  tar xzf /tmp/django-trabalhe-conosco.tar.gz -C $RemotePath/" -ForegroundColor White
Write-Host "  rm /tmp/django-trabalhe-conosco.tar.gz" -ForegroundColor White
Write-Host ""
Write-Host "  # Roda o deploy completo" -ForegroundColor Gray
Write-Host "  sudo bash $RemotePath/deploy/scripts/deploy-all.sh" -ForegroundColor White
Write-Host ""

# ---------- Limpa ----------
Remove-Item $tempTar -Force -ErrorAction SilentlyContinue
Write-Host "Arquivo temporario removido." -ForegroundColor Gray
Write-Host ""
Write-Host "Proximo passo: conecte na VPS e rode o deploy-all.sh" -ForegroundColor Green
