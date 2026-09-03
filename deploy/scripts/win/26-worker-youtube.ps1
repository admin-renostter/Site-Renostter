<#
    26-worker-youtube.ps1
    --------------------------------------------------------------
    1. Tira .claude/settings.local.json do controle de versao
       (o arquivo contem uma chave do Google e o repositorio e publico)
    2. Cadastra o secret YOUTUBE_API_KEY no Worker
    3. Publica o Worker com a nova rota /youtube (playlistItems + cache)
    4. Verifica a resposta em producao

    Uso:  powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\26-worker-youtube.ps1
#>

$ErrorActionPreference = 'Continue'

# Raiz do repositorio = tres niveis acima deste script
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $repo

$logDir = Join-Path $repo 'deploy\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$log = Join-Path $logDir '26-worker-youtube.log'

Start-Transcript -Path $log -Force | Out-Null
Write-Host "Repositorio: $repo" -ForegroundColor Cyan

# ── Etapa 1 — remover do Git o arquivo com a chave exposta ────────────
Write-Host "`n[1/4] Removendo .claude/settings.local.json do controle de versao..." -ForegroundColor Yellow
$rastreado = git ls-files --error-unmatch '.claude/settings.local.json' 2>$null
if ($LASTEXITCODE -eq 0) {
    git rm --cached '.claude/settings.local.json'
    Write-Host "  OK: o arquivo continua no seu disco, mas sai do repositorio no proximo commit." -ForegroundColor Green
} else {
    Write-Host "  Ja nao estava rastreado. Nada a fazer." -ForegroundColor Green
}

# ── Etapa 2 — secret (fora do transcript, para nao registrar a chave) ─
Stop-Transcript | Out-Null
Write-Host "`n[2/4] Cadastrando o secret YOUTUBE_API_KEY no Worker." -ForegroundColor Yellow
Write-Host "      Cole a chave quando o wrangler pedir e tecle Enter." -ForegroundColor Gray
Write-Host "      (esta etapa nao e gravada no log)" -ForegroundColor DarkGray
npx wrangler@4.18.0 secret put YOUTUBE_API_KEY --config wrangler.toml
$secretOk = ($LASTEXITCODE -eq 0)
Start-Transcript -Path $log -Append | Out-Null
if ($secretOk) { Write-Host "  Secret cadastrado." -ForegroundColor Green }
else { Write-Host "  Falha ao cadastrar o secret (codigo $LASTEXITCODE)." -ForegroundColor Red }

# ── Etapa 3 — publicar o Worker ───────────────────────────────────────
Write-Host "`n[3/4] Publicando o Worker..." -ForegroundColor Yellow
npm run deploy:worker
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Deploy falhou (codigo $LASTEXITCODE). Veja a saida acima." -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}
Write-Host "  Worker publicado." -ForegroundColor Green

# ── Etapa 4 — verificar em producao ───────────────────────────────────
Write-Host "`n[4/4] Verificando https://renostter-gemini-proxy.adminrenostter.workers.dev/youtube" -ForegroundColor Yellow
Start-Sleep -Seconds 5
$url = 'https://renostter-gemini-proxy.adminrenostter.workers.dev/youtube?channelId=UCPdh_nMh4XLdkVRH1jn7LuA&maxResults=12'
try {
    $r = Invoke-RestMethod -Uri $url -Headers @{ Origin = 'https://renostter.com' } -TimeoutSec 30
    Write-Host ("  source : {0}" -f $r.source) -ForegroundColor Cyan
    Write-Host ("  videos : {0}" -f $r.items.Count) -ForegroundColor Cyan
    if ($r.source -eq 'uploads') {
        Write-Host "  RESULTADO: galeria alimentada pela playlist de uploads. Tudo certo." -ForegroundColor Green
        Write-Host "  Primeiros titulos:" -ForegroundColor Gray
        $r.items | Select-Object -First 4 | ForEach-Object { Write-Host ("   - " + $_.snippet.title) -ForegroundColor Gray }
    } elseif ($r.source -eq 'search') {
        Write-Host "  ATENCAO: caiu no search.list. A playlist de uploads falhou." -ForegroundColor Yellow
    } else {
        Write-Host ("  ATENCAO: ainda em fallback estatico (source={0})." -f $r.source) -ForegroundColor Yellow
        Write-Host "  Verifique se a YouTube Data API v3 esta ativada no projeto da chave." -ForegroundColor Yellow
    }
} catch {
    Write-Host ("  Falha na verificacao: {0}" -f $_.Exception.Message) -ForegroundColor Red
}

Write-Host "`nLog salvo em: $log" -ForegroundColor Cyan
Stop-Transcript | Out-Null
