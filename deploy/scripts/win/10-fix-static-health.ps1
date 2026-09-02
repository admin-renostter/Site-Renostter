# ============================================================
# Renostter - Etapa 10: collectstatic, ALLOWED_HOSTS e worker
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\10-fix-static-health.ps1
#
#  1) start.sh agora roda collectstatic (o ManifestStaticFilesStorage exige)
#  2) ALLOWED_HOSTS ganhou 127.0.0.1 (healthcheck do container batia 400)
#  3) worker sem healthcheck HTTP e esperando o web ficar healthy
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "10-fix-static-health.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Hidrata e reenvia"
$n=0
Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(\.venv|__pycache__|staticfiles|private_media|\.git|logs)\\" } |
  ForEach-Object { try { $null=[System.IO.File]::ReadAllBytes($_.FullName); $n++ } catch {} }
Write-Host "$n arquivos hidratados"

$tar = Join-Path $env:TEMP "renostter-10.tar.gz"
Remove-Item $tar -Force -ErrorAction SilentlyContinue
$ex = @(
  "--exclude=django-trabalhe-conosco/.venv","--exclude=django-trabalhe-conosco/.env",
  "--exclude=django-trabalhe-conosco/db.sqlite3","--exclude=django-trabalhe-conosco/private_media",
  "--exclude=django-trabalhe-conosco/lancedb","--exclude=django-trabalhe-conosco/audit",
  "--exclude=django-trabalhe-conosco/logs","--exclude=django-trabalhe-conosco/staticfiles",
  "--exclude=deploy/logs","--exclude=deploy/_backup-pre-fix",
  "--exclude=.git","--exclude=__pycache__","--exclude=*.pyc","--exclude=*.bak"
)
& tar -czf $tar $ex -C $root "deploy" "django-trabalhe-conosco"
& scp @SSH $tar "root@${VpsIp}:/tmp/t10.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Remove-Item $tar -Force -ErrorAction SilentlyContinue

RemScript @'
cd /opt/renostter
tar xzf /tmp/t10.tar.gz && rm -f /tmp/t10.tar.gz
find . -type d -exec chmod 755 {} +
find . -type f -exec chmod 644 {} +
chmod +x deploy/scripts/*.sh django-trabalhe-conosco/start.sh
chmod 600 deploy/.env
find django-trabalhe-conosco -exec touch {} +
echo "-- collectstatic no start.sh? --"; grep -c collectstatic django-trabalhe-conosco/start.sh
echo "-- ALLOWED_HOSTS --"; grep "^ALLOWED_HOSTS" deploy/.env
cd deploy && docker compose config --quiet && echo COMPOSE_VALIDO
'@

Sec "2. Rebuild e recria"
RemScript @'
cd /opt/renostter/deploy
docker compose build web 2>&1 | tail -8
docker compose up -d --force-recreate web worker nginx 2>&1 | tail -20
'@

Sec "3. Aguarda o web ficar HEALTHY (nao so Up)"
RemScript @'
for i in $(seq 1 18); do
  sleep 10
  s=$(docker inspect -f "{{.State.Health.Status}}" renostter-web 2>/dev/null || echo "sem-health")
  echo "[$i] web health = $s"
  if [ "$s" = "healthy" ]; then echo WEB_HEALTHY; break; fi
done
'@

Sec "4. collectstatic gerou os arquivos?"
RemScript @'
echo "-- arquivos em /app/staticfiles --"
docker exec renostter-web sh -c "ls /app/staticfiles | head -10; echo ...; find /app/staticfiles -type f | wc -l"
echo "-- manifesto existe? --"
docker exec renostter-web sh -c "test -f /app/staticfiles/staticfiles.json && echo MANIFESTO_OK || echo MANIFESTO_FALTANDO"
echo "-- o nginx enxerga os mesmos arquivos? --"
docker exec renostter-nginx sh -c "find /app/staticfiles -type f | wc -l"
'@

Sec "5. Rotas reais da aplicacao"
RemScript @'
H="Host: carreiras.renostter.com"
for p in /healthz/ /trabalhe-conosco/ /candidatar/ /admin/login/ / ; do
  c=$(curl -s -o /dev/null -m 10 -w "%{http_code}" -H "$H" "http://127.0.0.1:8080$p")
  printf "%-22s -> HTTP %s\n" "$p" "$c"
done
echo "-- a pagina tem CSS de verdade? --"
curl -s -m 10 -H "$H" http://127.0.0.1:8080/trabalhe-conosco/ | grep -o "/static/[^\"']*" | head -5
'@

Sec "6. Status final"
RemScript @'
cd /opt/renostter/deploy
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo "-- erros no worker nos ultimos 3 min --"
docker compose logs --since 3m worker 2>/dev/null | grep -ci "error\|traceback" || echo 0
docker compose logs --tail=12 worker
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
