# ============================================================
# Renostter - Etapa 21: de onde vem o 403?
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\21-diag-403.ps1
#
# /admin/login/ e /static/careers/careers.css respondem 403 pela internet.
# Duas origens possiveis, e o teste separa as duas:
#   - se LOCAL responde 200 e PUBLICO responde 403 -> e a Cloudflare (WAF/bot)
#   - se LOCAL tambem responde 403 -> e o nginx (permissao ou regra de config)
#
# Tambem repete a prova do resolver forcando o web a MUDAR de IP de verdade.
# Nao altera nada: so mede.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "21-diag-403.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. LOCAL versus PUBLICO (e isso que separa nginx de Cloudflare)"
RemScript @'
H="Host: carreiras.renostter.com"
printf "%-38s %-8s %-8s\n" "ROTA" "LOCAL" "PUBLICO"
for p in /healthz/ /trabalhe-conosco/ /admin/login/ /static/careers/careers.css /candidatar/; do
  l=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -H "$H" "http://127.0.0.1:8080$p")
  g=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://carreiras.renostter.com$p")
  printf "%-38s %-8s %-8s\n" "$p" "$l" "$g"
done
'@

Sec "2. Quem assina o 403? (cabecalhos da resposta publica)"
RemScript @'
echo "--- /admin/login/ ---"
curl -s -I -m 25 https://carreiras.renostter.com/admin/login/ | head -15 | sed "s/^/  /"
echo "--- css ---"
curl -s -I -m 25 https://carreiras.renostter.com/static/careers/careers.css | head -15 | sed "s/^/  /"
'@

Sec "3. Os estaticos existem e sao legiveis pelo nginx?"
RemScript @'
echo "-- o arquivo existe no volume? --"
docker exec renostter-nginx sh -c "ls -l /app/staticfiles/careers/careers.css 2>&1"
echo "-- permissoes das pastas do caminho --"
docker exec renostter-nginx sh -c "ls -ld /app/staticfiles /app/staticfiles/careers 2>&1"
echo "-- o usuario do nginx consegue ler? --"
docker exec renostter-nginx sh -c "id nginx; su -s /bin/sh nginx -c 'head -c 40 /app/staticfiles/careers/careers.css' 2>&1 | head -2"
'@

Sec "4. Erros do nginx nos ultimos minutos"
RemScript 'docker exec renostter-nginx sh -c "tail -20 /var/log/nginx/renostter.error.log" | sed "s/^/  /"'

Sec "5. Prova real do resolver: forcar o web a mudar de IP"
# Recriar sozinho costuma devolver o mesmo IP. Subir um container extra ocupa
# o endereco e obriga o web a pegar outro.
RemScript @'
cd /opt/renostter/deploy
antes=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" renostter-web)
echo "IP antes: $antes"
docker stop renostter-web >/dev/null
# ocupa o IP liberado
docker run -d --rm --name ocupa-ip --network renostter_renostter-net alpine:3 sleep 120 >/dev/null
docker start renostter-web >/dev/null
sleep 40
depois=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" renostter-web)
echo "IP depois: $depois"
if [ "$antes" = "$depois" ]; then
  echo "  (o IP nao mudou - teste ainda inconclusivo)"
else
  echo "  IP MUDOU de verdade. Agora vale o teste:"
fi
for i in $(seq 1 10); do
  c=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -H "Host: carreiras.renostter.com" http://127.0.0.1:8080/healthz/)
  echo "  [$i] healthz -> HTTP $c"
  [ "$c" = "200" ] && { echo RESOLVER_FUNCIONA; break; }
  sleep 8
done
docker rm -f ocupa-ip >/dev/null 2>&1 || true
'@

Write-Host ""
Write-Host "Nada foi alterado. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
