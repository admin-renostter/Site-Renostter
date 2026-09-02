# ============================================================
# Renostter - Etapa 19: por que carreiras responde 502?
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\19-diag-502.ps1
#
# Depois do restart do Docker: tunel reconectado, status (302) e portainer
# (307) voltaram, mas carreiras da 502. 502 = o cloudflared alcancou a origem
# e a origem recusou. Isso isola o problema entre cloudflared -> nginx -> web.
#
# Provavel: o teste rodou enquanto o "web" ainda executava migrate +
# collectstatic no start. Se for isso, agora ja passou. O script mede em vez
# de supor, e so age se realmente houver algo quebrado.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "19-diag-502.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Todos os containers (lista completa)"
RemScript 'cd /opt/renostter/deploy && docker compose ps -a --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"'

Sec "2. Onde a cadeia quebra: cloudflared -> nginx -> web"
RemScript @'
echo "-- host -> nginx (127.0.0.1:8080) --"
curl -s -o /dev/null -m 10 -w "   HTTP %{http_code}\n" -H "Host: carreiras.renostter.com" http://127.0.0.1:8080/healthz/

echo "-- cloudflared -> nginx (dentro da rede docker) --"
docker run --rm --network renostter_renostter-net curlimages/curl:latest \
  -s -o /dev/null -m 10 -w "   HTTP %{http_code}\n" -H "Host: carreiras.renostter.com" http://nginx:80/healthz/ 2>&1 | tail -2

echo "-- nginx -> web (gunicorn) --"
docker exec renostter-nginx sh -c "wget -qO- --timeout=10 http://web:8000/healthz/ >/dev/null 2>&1 && echo '   web:8000 respondeu' || echo '   web:8000 NAO respondeu'" 2>&1 | tail -2

echo "-- o web esta healthy? --"
docker inspect -f "   health={{.State.Health.Status}} restarts={{.RestartCount}}" renostter-web
'@

Sec "3. Erros recentes do nginx"
RemScript @'
docker exec renostter-nginx sh -c "tail -25 /var/log/nginx/renostter.error.log 2>/dev/null" | sed "s/^/  /"
echo "--- log do container ---"
docker logs --tail=15 renostter-nginx 2>&1 | sed "s/^/  /"
'@

Sec "4. Logs do web"
RemScript 'docker logs --tail=30 renostter-web 2>&1 | sed "s/^/  /"'

Sec "5. Teste publico agora"
RemScript @'
for u in https://carreiras.renostter.com/healthz/ \
         https://carreiras.renostter.com/trabalhe-conosco/ \
         https://carreiras.renostter.com/admin/login/ \
         https://status.renostter.com/ ; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "$u")
  printf "  %-50s -> HTTP %s\n" "$u" "$c"
done
'@

Sec "6. Se ainda houver 502, recria nginx e web"
RemScript @'
c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" https://carreiras.renostter.com/healthz/)
if [ "$c" = "200" ]; then
  echo "  Ja esta 200 - nada a fazer."
else
  echo "  Ainda em HTTP $c. Recriando nginx e web..."
  cd /opt/renostter/deploy
  docker compose up -d --force-recreate nginx web 2>&1 | tail -10
  for i in $(seq 1 15); do
    sleep 10
    c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" https://carreiras.renostter.com/healthz/)
    echo "  [$i] healthz publico -> HTTP $c"
    [ "$c" = "200" ] && { echo SITE_NO_AR; break; }
  done
fi
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
