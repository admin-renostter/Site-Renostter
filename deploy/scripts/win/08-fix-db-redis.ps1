# ============================================================
# Renostter - Etapa 8: corrige banco (SQLite -> Postgres) e cache Redis
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\08-fix-db-redis.ps1
#
# Duas correcoes:
#  1) .env ganhou DB_ENGINE/DB_NAME/DB_USER/DB_PASSWORD - o settings.py le
#     essas, nao as POSTGRES_*, e por isso estava usando SQLite.
#  2) requirements.txt ganhou 'redis' - exigido pelo CACHE_BACKEND.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "08-fix-db-redis.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($c) { & ssh @SSH "root@$VpsIp" $c 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Hidrata arquivos do OneDrive"
# Sem isso o tar pode reempacotar placeholders zerados (foi a causa do manage.py).
$n = 0
Get-ChildItem -Path (Join-Path $root "django-trabalhe-conosco") -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(\.venv|__pycache__|staticfiles|private_media)\\" } |
  ForEach-Object { try { $null = [System.IO.File]::ReadAllBytes($_.FullName); $n++ } catch {} }
Get-ChildItem -Path (Join-Path $root "deploy") -Recurse -File -ErrorAction SilentlyContinue |
  ForEach-Object { try { $null = [System.IO.File]::ReadAllBytes($_.FullName); $n++ } catch {} }
Write-Host "$n arquivos hidratados"

Sec "2. Reenvia projeto"
$tar = Join-Path $env:TEMP "renostter-fix.tar.gz"
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
& scp @SSH $tar "root@${VpsIp}:/tmp/fix.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Remove-Item $tar -Force -ErrorAction SilentlyContinue

$apply = @'
cd /opt/renostter
tar xzf /tmp/fix.tar.gz && rm -f /tmp/fix.tar.gz
find . -type d -exec chmod 755 {} +
find . -type f -exec chmod 644 {} +
chmod +x deploy/scripts/*.sh django-trabalhe-conosco/start.sh
chmod 600 deploy/.env
# mtime novo: sem isso o BuildKit reusa o snapshot de contexto antigo
find django-trabalhe-conosco -exec touch {} +
echo "-- integridade --"
sha256sum django-trabalhe-conosco/manage.py | cut -c1-16
echo "-- DB_* chegaram? --"
grep -c "^DB_ENGINE=\|^DB_NAME=\|^DB_USER=\|^DB_PASSWORD=" deploy/.env
echo "-- redis no requirements? --"
grep -c "^redis" django-trabalhe-conosco/requirements.txt
'@
& ssh @SSH "root@$VpsIp" $apply 2>&1 | ForEach-Object { Write-Host $_ }

Sec "3. Rebuild (precisa reinstalar deps por causa do redis)"
Rem "cd /opt/renostter/deploy && docker compose build web 2>&1 | tail -15"

Sec "4. Confirma que o redis entrou na imagem"
Rem "docker run --rm --entrypoint python renostter-careers:latest -c 'import redis, django; print(\"redis\", redis.__version__, \"| django\", django.__version__)'"

Sec "5. Recria web e worker"
Rem "cd /opt/renostter/deploy && docker compose up -d --force-recreate web worker nginx 2>&1 | tail -15"

Sec "6. Aguarda"
$wait = @'
for i in $(seq 1 15); do
  sleep 10
  st=$(cd /opt/renostter/deploy && docker compose ps --format '{{.Name}} {{.Status}}')
  echo "[$i]"; echo "$st"
  if echo "$st" | grep -q "renostter-web.*Up"; then echo WEB_NO_AR; break; fi
done
'@
& ssh @SSH "root@$VpsIp" $wait 2>&1 | ForEach-Object { Write-Host $_ }

Sec "7. O Django esta mesmo no Postgres agora?"
$dbcheck = @'
cd /opt/renostter/deploy
echo "-- engine que o Django enxerga --"
docker compose exec -T web python -c "from django.conf import settings; import django; django.setup(); print(settings.DATABASES['default']['ENGINE'], settings.DATABASES['default']['NAME'], settings.DATABASES['default']['HOST'])" 2>&1 | tail -3
echo "-- tabelas no Postgres --"
docker compose exec -T postgres psql -U renostter_app -d renostter_careers -c "\dt" 2>&1 | head -25
'@
& ssh @SSH "root@$VpsIp" $dbcheck 2>&1 | ForEach-Object { Write-Host $_ }

Sec "8. Healthcheck"
Rem "curl -fsS -m 10 -o /dev/null -w 'healthz HTTP %{http_code}\n' -H 'Host: carreiras.renostter.com' http://127.0.0.1:8080/healthz/ || echo HEALTHZ_FALHOU"

Sec "9. Status e logs"
Rem "cd /opt/renostter/deploy && docker compose ps --format 'table {{.Name}}\t{{.Status}}'; echo '--- web ---'; docker compose logs --tail=30 web; echo '--- worker ---'; docker compose logs --tail=25 worker"

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
