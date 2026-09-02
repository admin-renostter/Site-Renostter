# ============================================================
# Renostter - Etapa 9: verificacao completa da stack
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\09-verificar.ps1
#
# Nao muda nada na VPS - so mede.
#
# NOTA TECNICA: todo script remoto vai em BASE64. Passar shell script como
# argumento do ssh faz o texto atravessar PowerShell -> ssh -> bash, e cada
# camada reinterpreta aspas. Foi o que quebrou as verificacoes das etapas 6, 8
# e 9 anteriores. Em base64 nao existe caractere especial para ninguem comer.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "09-verificar.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

function RemScript($script) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Containers"
RemScript @'
cd /opt/renostter/deploy
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
'@

Sec "2. Qual banco o Django esta usando de verdade"
RemScript @'
cat > /tmp/chk.py <<'PYEOF'
import django, os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "renostter_careers.settings")
django.setup()
from django.conf import settings
from django.db import connection
d = settings.DATABASES["default"]
print("ENGINE :", d["ENGINE"])
print("NAME   :", d["NAME"])
print("HOST   :", d["HOST"], "PORT", d["PORT"])
with connection.cursor() as c:
    c.execute("SELECT version()")
    print("SERVIDOR:", c.fetchone()[0][:60])
    c.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    print("TABELAS :", c.fetchone()[0])
if "postgresql" in d["ENGINE"]:
    print("BANCO_OK")
else:
    print("BANCO_ERRADO_AINDA_SQLITE")
PYEOF
docker compose -f /opt/renostter/deploy/docker-compose.yml cp /tmp/chk.py web:/tmp/chk.py 2>/dev/null || docker cp /tmp/chk.py renostter-web:/tmp/chk.py
docker exec renostter-web python /tmp/chk.py
'@

Sec "3. Tabelas no Postgres"
RemScript @'
docker exec renostter-postgres psql -U renostter_app -d renostter_careers -c "\dt" | head -30
'@

Sec "4. Bibliotecas dentro da imagem"
RemScript @'
docker exec renostter-web python -c "
import redis, django, psycopg, gunicorn
print('django  ', django.__version__)
print('redis   ', redis.__version__)
print('psycopg ', psycopg.__version__)
"
'@

Sec "5. Redis responde e o cache do Django funciona"
RemScript @'
docker exec renostter-redis redis-cli ping
docker exec renostter-web python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','renostter_careers.settings')
django.setup()
from django.core.cache import cache
cache.set('ping','pong',30)
print('CACHE:', cache.get('ping'))
"
'@

Sec "6. Worker: ainda ha erro nos ultimos 2 minutos?"
RemScript @'
cd /opt/renostter/deploy
n=$(docker compose logs --since 2m worker 2>/dev/null | grep -ci "error\|traceback" || true)
echo "linhas com erro nos ultimos 2min: $n"
docker compose logs --tail=15 worker
'@

Sec "7. HTTP pelo nginx"
RemScript @'
H="Host: carreiras.renostter.com"
for p in /healthz/ / /static/; do
  code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" -H "$H" "http://127.0.0.1:8080$p")
  printf "%-12s -> HTTP %s\n" "$p" "$code"
done
'@

Sec "8. Recursos"
RemScript @'
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -10
echo; free -h | head -2; df -h / | tail -1
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
