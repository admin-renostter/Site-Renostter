# ============================================================
# Renostter - Etapa 2: envia o projeto para a VPS
# ============================================================
#   cd "C:\Users\joaop\OneDrive\Documentos\ANTGRAVITY\renostter-site\Site-Renostter\Site-Renostter"
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\02-push.ps1
#
# Usa a chave SSH (sem senha). Nao roda nada na VPS alem de criar a pasta
# e descompactar - o deploy de verdade e a etapa 3.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log    = Join-Path $logDir "02-push.log"
Start-Transcript -Path $log -Force | Out-Null

$VpsIp      = "184.107.156.130"
$KeyPath    = Join-Path $HOME ".ssh\id_ed25519_renostter"
$RemotePath = "/opt/renostter"
$SSH  = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-i",$KeyPath)

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($cmd) { & ssh @SSH "root@$VpsIp" $cmd 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "0. Checagens locais"
$deployPath = Join-Path $root "deploy"
$djangoPath = Join-Path $root "django-trabalhe-conosco"
foreach ($p in @($deployPath,$djangoPath)) {
    if (-not (Test-Path $p)) { Write-Host "ERRO: nao achei $p" -ForegroundColor Red; Stop-Transcript|Out-Null; exit 1 }
}
$envPath = Join-Path $deployPath ".env"
if (-not (Test-Path $envPath)) { Write-Host "ERRO: deploy\.env nao existe." -ForegroundColor Red; Stop-Transcript|Out-Null; exit 1 }
if (Select-String -Path $envPath -Pattern "PREENCHER_" -Quiet) {
    Write-Host "[AVISO] O .env ainda tem campos PREENCHER_:" -ForegroundColor Yellow
    Select-String -Path $envPath -Pattern "PREENCHER_" | ForEach-Object { Write-Host "   $($_.Line)" -ForegroundColor Yellow }
    Write-Host "A stack sobe assim, mas o upload de curriculos (Supabase) nao funciona." -ForegroundColor Yellow
}
Write-Host "Projeto: $root"

Sec "1. Conexao com a VPS"
$t = & ssh @SSH "root@$VpsIp" "echo CONECTADO; uptime" 2>&1
$t | ForEach-Object { Write-Host $_ }
if (-not ($t -match "CONECTADO")) {
    Write-Host "Sem conexao por chave. Rode a etapa 01 antes." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

Sec "2. Cria a pasta de destino"
# Isso vem ANTES do envio - era o bug do push-to-vps.ps1 antigo, que mandava
# arquivos para uma pasta que ainda nao existia.
Rem "mkdir -p $RemotePath && echo PASTA_OK && df -h $RemotePath | tail -1"

Sec "3. Empacota o projeto"
$tar = Join-Path $env:TEMP "renostter-$(Get-Date -Format yyyyMMdd-HHmmss).tar.gz"
$exclude = @(
  "django-trabalhe-conosco/.venv", "django-trabalhe-conosco/.env",
  "django-trabalhe-conosco/db.sqlite3", "django-trabalhe-conosco/private_media",
  "django-trabalhe-conosco/lancedb", "django-trabalhe-conosco/audit",
  "django-trabalhe-conosco/logs", "django-trabalhe-conosco/staticfiles",
  "deploy/logs", "deploy/_backup-pre-fix",
  ".git", "__pycache__", "*.pyc", ".pytest_cache", ".vscode", ".idea", "*.bak"
)
Write-Host "Excluindo: $($exclude -join ', ')" -ForegroundColor Gray
$args = $exclude | ForEach-Object { "--exclude=$_" }
& tar -czf $tar @args -C $root "deploy" "django-trabalhe-conosco" 2>&1 | ForEach-Object { Write-Host $_ }
if (-not (Test-Path $tar)) { Write-Host "ERRO: tar falhou" -ForegroundColor Red; Stop-Transcript|Out-Null; exit 1 }
$mb = [math]::Round((Get-Item $tar).Length/1MB, 1)
Write-Host "Pacote: $mb MB"

Sec "4. Envia"
& scp @SSH $tar "root@${VpsIp}:/tmp/renostter.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }

Sec "5. Descompacta e ajusta permissoes"
Rem "tar xzf /tmp/renostter.tar.gz -C $RemotePath && rm -f /tmp/renostter.tar.gz && chmod 600 $RemotePath/deploy/.env && chmod +x $RemotePath/deploy/scripts/*.sh && echo EXTRAIDO_OK"

Sec "6. Confere o que chegou"
Rem "cd $RemotePath && echo '--- arvore ---' && ls -la && echo '--- deploy ---' && ls -la deploy && echo '--- scripts ---' && ls -la deploy/scripts/*.sh && echo '--- .env (so os nomes) ---' && grep -oE '^[A-Z_]+=' deploy/.env | tr '\n' ' ' && echo && echo '--- compose valido? ---' && cd deploy && docker compose config --quiet && echo COMPOSE_VALIDO"

Remove-Item $tar -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Pronto. Log em $log" -ForegroundColor Cyan
Write-Host "Me avise no chat - eu confiro e libero a etapa 3 (deploy)." -ForegroundColor Cyan
Stop-Transcript | Out-Null
