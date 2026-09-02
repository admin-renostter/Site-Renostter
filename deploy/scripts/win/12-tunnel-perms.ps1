# ============================================================
# Renostter - Etapa 12: corrige o dono das credenciais do tunel
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\12-tunnel-perms.ps1
#
# A imagem cloudflare/cloudflared roda como "nonroot" (uid 65532). O arquivo
# renostter.json estava root:root 600 -> permission denied -> restart loop.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "12-tunnel-perms.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Qual uid a imagem usa de fato"
RemScript @'
echo -n "usuario do container cloudflared: "
docker run --rm --entrypoint id cloudflare/cloudflared:2024.8.3 2>/dev/null || echo "(imagem distroless, sem 'id' - assumindo 65532)"
echo "-- antes --"
ls -ln /opt/renostter/deploy/cloudflared/
'@

Sec "2. Ajusta dono e permissao"
RemScript @'
f=/opt/renostter/deploy/cloudflared/renostter.json
chown 65532:65532 "$f"
chmod 600 "$f"
# a pasta tambem precisa ser atravessavel pelo uid do container
chmod 755 /opt/renostter/deploy/cloudflared
echo "-- depois --"
ls -ln /opt/renostter/deploy/cloudflared/
'@

Sec "3. Reinicia o cloudflared"
RemScript @'
cd /opt/renostter/deploy
docker compose up -d --force-recreate cloudflared 2>&1 | tail -8
'@

Sec "4. Conectou?"
RemScript @'
for i in $(seq 1 12); do
  sleep 8
  if docker logs renostter-cloudflared 2>&1 | grep -qiE "Registered tunnel connection|Connection [a-z0-9-]+ registered"; then
    echo TUNEL_CONECTADO; break
  fi
  echo "[$i] aguardando..."
done
echo "--- ultimos logs ---"
docker logs --tail=25 renostter-cloudflared 2>&1
'@

Sec "5. Rotas publicas"
RemScript @'
echo "-- DNS --"
for h in carreiras status portainer; do
  printf "%-28s " "$h.renostter.com"
  getent hosts "$h.renostter.com" | head -1 || echo "NAO RESOLVE AINDA"
done
echo
echo "-- HTTP --"
for u in https://carreiras.renostter.com/trabalhe-conosco/ https://carreiras.renostter.com/healthz/ https://status.renostter.com/ https://portainer.renostter.com/; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "$u")
  printf "%-52s -> HTTP %s\n" "$u" "$c"
done
'@

Sec "6. Status geral"
RemScript @'
cd /opt/renostter/deploy && docker compose ps --format "table {{.Name}}\t{{.Status}}"
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
