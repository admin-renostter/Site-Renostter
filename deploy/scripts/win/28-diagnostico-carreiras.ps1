# ============================================================
# Renostter - Etapa 28: por que carreiras.renostter.com caiu
# ============================================================
#   Diagnostico (nao altera nada):
#     powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\28-diagnostico-carreiras.ps1
#
#   Diagnostico + tentativa de religar a stack (pergunta antes):
#     powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\28-diagnostico-carreiras.ps1 -Religar
# ============================================================

param([switch]$Religar)

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "28-diagnostico-carreiras.log"
Start-Transcript -Path $log -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)

function RodarRemoto([string]$texto) {
    $limpo = $texto -replace "`r`n", "`n"
    $b64   = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($limpo))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Write-Host "carreiras.renostter.com esta respondendo 502." -ForegroundColor Yellow
Write-Host "Coletando o diagnostico em $VpsIp — nada sera alterado." -ForegroundColor Cyan
Write-Host ""

$sh = Join-Path $root "deploy\scripts\diagnostico-carreiras.sh"
if (-not (Test-Path $sh)) {
    Write-Host "Nao encontrei $sh" -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}
RodarRemoto (Get-Content -Raw -Path $sh)

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "A conexao SSH falhou (codigo $LASTEXITCODE)." -ForegroundColor Red
    Write-Host "Se a VPS nao responde nem por SSH, o problema e maior que os containers." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

if (-not $Religar) {
    Write-Host ""
    Write-Host "Relatorio salvo em: $log" -ForegroundColor Cyan
    Write-Host "Me mande esse arquivo. Se quiser ja tentar religar, rode de novo com -Religar." -ForegroundColor Gray
    Stop-Transcript | Out-Null
    exit 0
}

# ---------- religar, somente com confirmacao explicita ----------
Write-Host ""
Write-Host "ATENCAO: vou subir novamente os containers da stack de carreiras." -ForegroundColor Yellow
Write-Host "Isso derruba e recria web, worker e nginx. O site de carreiras ja esta fora," -ForegroundColor Yellow
Write-Host "entao o risco e baixo, mas e uma alteracao em producao." -ForegroundColor Yellow
$resp = Read-Host "Digite RELIGAR para confirmar"
if ($resp -ne "RELIGAR") {
    Write-Host "Cancelado. Nada foi alterado." -ForegroundColor Gray
    Stop-Transcript | Out-Null; exit 0
}

RodarRemoto @'
cd /opt/renostter/deploy
echo "--- subindo containers que estiverem parados ---"
docker compose up -d
sleep 20
echo
echo "--- estado apos subir ---"
docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}"
echo
echo "--- healthz por dentro ---"
curl -s -m 5 -o /dev/null -w "nginx local: HTTP %{http_code}\n" http://127.0.0.1:8080/healthz/ || echo "nginx local: FALHOU"
'@

Write-Host ""
Write-Host "Verificando de fora..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
try {
    $r = Invoke-WebRequest -Uri "https://carreiras.renostter.com/healthz/" -TimeoutSec 30 -UseBasicParsing
    Write-Host ("  carreiras.renostter.com/healthz/ -> HTTP {0}" -f $r.StatusCode) -ForegroundColor Green
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host ("  carreiras.renostter.com/healthz/ -> HTTP {0} (ainda com problema)" -f $code) -ForegroundColor Red
}

Write-Host ""
Write-Host "Relatorio salvo em: $log" -ForegroundColor Cyan
Stop-Transcript | Out-Null
