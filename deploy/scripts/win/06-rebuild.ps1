# ============================================================
# Renostter - Etapa 6: rebuild SEM CACHE e verificacao dentro da imagem
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\06-rebuild.ps1
#
# O arquivo na VPS ja esta correto (INTEGRIDADE_OK na etapa 5), mas o
# BuildKit reaproveitou a camada COPY antiga e a imagem continua com o
# manage.py zerado. Aqui o build e forcado e a imagem e inspecionada ANTES
# de subir container.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "06-rebuild.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($c) { & ssh @SSH "root@$VpsIp" $c 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Confirma o fonte na VPS (deve bater com ac0c759b5c209ce1)"
Rem "cd /opt/renostter/django-trabalhe-conosco && sha256sum manage.py | cut -c1-16 && wc -c < manage.py"

Sec "2. Derruba web/worker e apaga a imagem velha"
# Sem remover a imagem, o BuildKit pode reaproveitar a camada COPY de novo.
Rem "cd /opt/renostter/deploy && docker compose stop web worker 2>&1 | tail -5; docker compose rm -f web worker 2>&1 | tail -5; docker image rm -f renostter-careers:latest 2>&1 | tail -3; echo IMAGEM_REMOVIDA"

Sec "3. Build sem cache (leva ~2-4 min, baixa os pacotes de novo)"
Rem "cd /opt/renostter/deploy && docker compose build --no-cache web 2>&1 | tail -25"

Sec "4. A imagem ficou correta? (inspeciona ANTES de subir)"
$verify = @'
cd /opt/renostter/deploy
echo "-- manage.py DENTRO da imagem --"
docker run --rm --entrypoint sh renostter-careers:latest -c 'wc -c < /app/manage.py; sha256sum /app/manage.py | cut -c1-16; head -c 40 /app/manage.py | od -c | head -3'
echo "-- python consegue importar? --"
if docker run --rm --entrypoint sh renostter-careers:latest -c 'python -c "import ast,sys; ast.parse(open(\"/app/manage.py\").read()); print(\"MANAGE_PY_VALIDO\")"'; then
  echo IMAGEM_OK
else
  echo IMAGEM_AINDA_CORROMPIDA
fi
'@
$vr = & ssh @SSH "root@$VpsIp" $verify 2>&1
$vr | ForEach-Object { Write-Host $_ }
if (-not ($vr -match "IMAGEM_OK")) {
    Write-Host ""
    Write-Host "A imagem ainda esta ruim. Nao vou subir container. Me mande o log." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

Sec "5. Sobe web, worker e nginx"
Rem "cd /opt/renostter/deploy && docker compose up -d --force-recreate web worker nginx 2>&1 | tail -20"

Sec "6. Aguarda"
$wait = @'
for i in $(seq 1 12); do
  sleep 10
  st=$(cd /opt/renostter/deploy && docker compose ps --format '{{.Name}} {{.Status}}')
  echo "[$i]"; echo "$st"
  if echo "$st" | grep -q "renostter-web.*Up"; then echo WEB_NO_AR; break; fi
done
'@
& ssh @SSH "root@$VpsIp" $wait 2>&1 | ForEach-Object { Write-Host $_ }

Sec "7. Healthcheck"
Rem "curl -fsS -m 10 -o /dev/null -w 'healthz HTTP %{http_code}\n' -H 'Host: carreiras.renostter.com' http://127.0.0.1:8080/healthz/ || echo HEALTHZ_FALHOU"

Sec "8. Status e logs"
Rem "cd /opt/renostter/deploy && docker compose ps --format 'table {{.Name}}\t{{.Status}}'; echo '--- web ---'; docker compose logs --tail=45 web; echo '--- worker ---'; docker compose logs --tail=15 worker"

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
