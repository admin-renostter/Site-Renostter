# ============================================================
# Renostter - Etapa 22: liberar leitura dos estaticos para o nginx
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\22-corrigir-estaticos.ps1
#
# O log do nginx foi explicito:
#   open() "/app/staticfiles/careers/careers.css" failed (13: Permission denied)
#
# Motivo: o collectstatic grava como uid 1001 (django) com umask 027 ->
# arquivos 640, pasta careers 750. O nginx roda como uid 101 em OUTRO
# container e le o mesmo volume: sem permissao, 403.
#
# Correcao permanente no start.sh (chmod -R a+rX apos o collectstatic) +
# um chmod imediato para nao esperar o proximo deploy.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "22-corrigir-estaticos.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Correcao imediata no volume"
RemScript @'
echo "-- antes --"
docker exec renostter-nginx sh -c "ls -ld /app/staticfiles/careers; ls -l /app/staticfiles/careers/careers.css"
# o web monta o mesmo volume com permissao de escrita
docker exec -u 0 renostter-web sh -c "chmod -R a+rX /app/staticfiles && echo chmod_ok"
echo "-- depois --"
docker exec renostter-nginx sh -c "ls -ld /app/staticfiles/careers; ls -l /app/staticfiles/careers/careers.css"
echo "-- o nginx le agora? --"
docker exec renostter-nginx sh -c "su -s /bin/sh nginx -c 'head -c 30 /app/staticfiles/careers/careers.css' && echo '' && echo LEITURA_OK" 2>&1 | tail -3
'@

Sec "2. Envia o start.sh corrigido (para nao voltar no proximo deploy)"
$tar = Join-Path $env:TEMP "renostter-start.tar.gz"
Remove-Item $tar -Force -ErrorAction SilentlyContinue
& tar -czf $tar -C $root "django-trabalhe-conosco/start.sh"
& scp @SSH $tar "root@${VpsIp}:/tmp/st.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Remove-Item $tar -Force -ErrorAction SilentlyContinue
RemScript @'
cd /opt/renostter
tar xzf /tmp/st.tar.gz && rm -f /tmp/st.tar.gz
chmod +x django-trabalhe-conosco/start.sh
find django-trabalhe-conosco -exec touch {} +
grep -n "chmod -R a+rX" django-trabalhe-conosco/start.sh
'@

Sec "3. Rebuild e recria o web (valida o start.sh novo)"
RemScript @'
cd /opt/renostter/deploy
docker compose build web 2>&1 | tail -6
docker compose up -d --force-recreate web 2>&1 | tail -6
for i in $(seq 1 15); do
  sleep 10
  s=$(docker inspect -f "{{.State.Health.Status}}" renostter-web 2>/dev/null || echo "?")
  echo "  [$i] web health = $s"
  [ "$s" = "healthy" ] && break
done
echo "-- permissoes apos o start.sh novo --"
docker exec renostter-nginx sh -c "ls -ld /app/staticfiles/careers; ls -l /app/staticfiles/careers/careers.css"
'@

Sec "4. Teste final: local e publico"
RemScript @'
H="Host: carreiras.renostter.com"
printf "%-40s %-8s %-8s\n" "ROTA" "LOCAL" "PUBLICO"
for p in /healthz/ /trabalhe-conosco/ /candidatar/ /static/careers/careers.css /admin/login/; do
  l=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -H "$H" "http://127.0.0.1:8080$p")
  g=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://carreiras.renostter.com$p")
  printf "%-40s %-8s %-8s\n" "$p" "$l" "$g"
done
echo
echo "-- todos os estaticos que a pagina pede --"
for u in $(curl -s -m 20 -H "$H" http://127.0.0.1:8080/trabalhe-conosco/ | grep -oE "/static/[^\"']+" | sort -u | head -8); do
  c=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -H "$H" "http://127.0.0.1:8080$u")
  printf "   %-46s -> HTTP %s\n" "$u" "$c"
done
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
