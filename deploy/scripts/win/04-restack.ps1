# ============================================================
# Renostter - Etapa 4: re-sincroniza deploy/ e sobe a stack
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\04-restack.ps1
#
# Use este script sempre que eu mexer em algo dentro de deploy/
# (compose, nginx, scripts). Ele reenvia so essa pasta e reaplica.
# Nao rebuilda a imagem Django - so faz isso se o codigo mudar.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "04-restack.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$R       = "/opt/renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($cmd) { & ssh @SSH "root@$VpsIp" $cmd 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Reenvia a pasta deploy/"
$tar = Join-Path $env:TEMP "renostter-deploy-$(Get-Date -Format HHmmss).tar.gz"
& tar -czf $tar --exclude="deploy/logs" --exclude="deploy/_backup-pre-fix" --exclude="*.bak" -C $root "deploy" 2>&1 | ForEach-Object { Write-Host $_ }
& scp @SSH $tar "root@${VpsIp}:/tmp/d.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Rem "tar xzf /tmp/d.tar.gz -C $R && rm -f /tmp/d.tar.gz && cd $R && find deploy -type d -exec chmod 755 {} + && find deploy -type f -exec chmod 644 {} + && chmod +x deploy/scripts/*.sh && chmod 600 deploy/.env && echo SINCRONIZADO && cd deploy && docker compose config --quiet && echo COMPOSE_VALIDO"
Remove-Item $tar -Force -ErrorAction SilentlyContinue

Sec "2. Estado antes"
Rem "cd $R/deploy && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"

Sec "3. Aplica (recria so o que mudou)"
Rem "cd $R/deploy && docker compose up -d postgres redis web worker nginx portainer uptime-kuma 2>&1 | tail -30"

Sec "4. Aguarda a stack estabilizar"
# O postgres ja foi inicializado no boot anterior, entao agora fica saudavel rapido.
# O web ainda roda migrations no start, o que leva alguns segundos.
#
# Este bloco vai como here-string de ASPAS SIMPLES: o PowerShell nao interpola
# NADA aqui dentro. Sem isso ele tenta avaliar $(...) e $i como codigo dele
# proprio, e quebra no && (que o PowerShell 5.1 nem suporta).
$wait = @'
for i in $(seq 1 12); do
  sleep 10
  st=$(cd /opt/renostter/deploy && docker compose ps --format '{{.Name}} {{.Status}}')
  echo "[tentativa $i]"
  echo "$st"
  if echo "$st" | grep -q "renostter-web.*Up"; then echo "WEB_NO_AR"; break; fi
done
'@
& ssh @SSH "root@$VpsIp" $wait 2>&1 | ForEach-Object { Write-Host $_ }

Sec "5. Status final"
Rem "cd $R/deploy && docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"

Sec "6. Healthcheck"
Rem "curl -fsS -m 10 -o /dev/null -w 'healthz HTTP %{http_code}\n' -H 'Host: carreiras.renostter.com' http://127.0.0.1:8080/healthz/ || echo HEALTHZ_FALHOU"

Sec "7. Logs"
Rem "cd $R/deploy && echo '--- web ---' && docker compose logs --tail=50 web; echo '--- worker ---'; docker compose logs --tail=25 worker; echo '--- nginx ---'; docker compose logs --tail=20 nginx"

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
