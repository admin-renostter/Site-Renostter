# ============================================================
# Renostter - Etapa 11: sobe o cloudflared e testa as rotas publicas
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\11-tunnel-up.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "11-tunnel-up.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. O setup deixou tudo no lugar?"
$pre = @'
ok=1
echo "-- certificado da conta --"
if [ -f /root/.cloudflared/cert.pem ]; then echo "  cert.pem OK"; else echo "  cert.pem FALTANDO"; ok=0; fi
echo "-- tuneis na conta --"
cloudflared tunnel list 2>&1 | head -10
echo "-- credenciais no bind mount --"
ls -l /opt/renostter/deploy/cloudflared/ 2>/dev/null
if ls /opt/renostter/deploy/cloudflared/renostter.json >/dev/null 2>&1; then echo "  renostter.json OK"; else echo "  renostter.json FALTANDO"; ok=0; fi
echo "-- config.yml: tunnel e credentials --"
grep -E "^tunnel:|^credentials-file:" /opt/renostter/deploy/cloudflared/config.yml
if grep -qE "^tunnel: [0-9a-f-]{36}$" /opt/renostter/deploy/cloudflared/config.yml; then
  echo "  UUID gravado OK"
else
  echo "  ATENCAO: 'tunnel:' nao parece um UUID - o setup nao completou"
  ok=0
fi
[ "$ok" -eq 1 ] && echo PRE_OK || echo PRE_FALHOU
'@
$p = & ssh @SSH "root@$VpsIp" ("echo " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pre)) + " | base64 -d | bash") 2>&1
$p | ForEach-Object { Write-Host $_ }
if (-not ($p -match "PRE_OK")) {
    Write-Host ""
    Write-Host "O setup do tunel nao completou. Nao vou subir o container." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

Sec "2. Sobe o cloudflared"
RemScript @'
cd /opt/renostter/deploy
docker compose up -d cloudflared 2>&1 | tail -10
'@

Sec "3. O tunel conectou?"
RemScript @'
for i in $(seq 1 10); do
  sleep 8
  if docker logs renostter-cloudflared 2>&1 | grep -qi "Registered tunnel connection\|Connection .* registered"; then
    echo TUNEL_CONECTADO; break
  fi
  echo "[$i] aguardando conexao..."
done
echo "--- logs do cloudflared ---"
docker logs --tail=30 renostter-cloudflared 2>&1
'@

Sec "4. Rotas publicas (pela internet de verdade)"
RemScript @'
for h in carreiras status portainer; do
  u="https://$h.renostter.com/"
  c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$u")
  printf "%-34s -> HTTP %s\n" "$u" "$c"
done
echo "-- a pagina de vagas responde? --"
curl -s -o /dev/null -m 20 -w "carreiras/trabalhe-conosco/ -> HTTP %{http_code}\n" https://carreiras.renostter.com/trabalhe-conosco/
echo "-- o TLS e da Cloudflare? --"
curl -s -o /dev/null -m 20 -w "TLS %{ssl_verify_result} | redirect %{redirect_url}\n" https://carreiras.renostter.com/trabalhe-conosco/
'@

Sec "5. Status geral"
RemScript @'
cd /opt/renostter/deploy
docker compose ps --format "table {{.Name}}\t{{.Status}}"
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
