# ============================================================
# Renostter - Etapa 14: aponta carreiras.renostter.com para o tunel
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\14-virar-dns.ps1
#
# O registro atual e um CNAME para renostter-careers.onrender.com, criado
# quando o site vivia no Render. O banco de la foi excluido, entao nao ha
# migracao pendente: sobrescrevemos o registro para o tunel.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "14-virar-dns.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Atualiza o .env (sem a URL morta do Render)"
& scp @SSH (Join-Path $root "deploy\.env") "root@${VpsIp}:/opt/renostter/deploy/.env" 2>&1 | ForEach-Object { Write-Host $_ }
RemScript 'chmod 600 /opt/renostter/deploy/.env; echo ENV_ATUALIZADO'

Sec "2. Para onde aponta hoje"
RemScript @'
echo "-- antes --"
getent hosts carreiras.renostter.com | head -3
'@

Sec "3. Sobrescreve o registro DNS"
RemScript @'
cloudflared tunnel route dns --overwrite-dns renostter carreiras.renostter.com 2>&1
echo "rc=$?"
'@

Sec "4. Aguarda a propagacao"
RemScript @'
for i in $(seq 1 15); do
  sleep 12
  code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" https://carreiras.renostter.com/healthz/)
  echo "[$i] healthz publico -> HTTP $code"
  if [ "$code" = "200" ]; then echo DNS_VIRADO; break; fi
done
'@

Sec "5. Teste completo pela internet"
RemScript @'
for p in /healthz/ /trabalhe-conosco/ /admin/login/; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://carreiras.renostter.com$p")
  printf "%-40s -> HTTP %s\n" "carreiras.renostter.com$p" "$c"
done
echo
echo "-- o CSS carrega? --"
curl -s -o /dev/null -m 25 -w "css -> HTTP %{http_code}\n" https://carreiras.renostter.com/static/careers/careers.css
echo "-- certificado --"
curl -s -o /dev/null -m 25 -w "TLS verify=%{ssl_verify_result} | http=%{http_version}\n" https://carreiras.renostter.com/trabalhe-conosco/
echo
echo "-- as outras rotas continuam? --"
for h in status portainer; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://$h.renostter.com/")
  printf "%-30s -> HTTP %s\n" "$h.renostter.com" "$c"
done
'@

Sec "6. Status da stack"
RemScript 'cd /opt/renostter/deploy && docker compose ps --format "table {{.Name}}\t{{.Status}}"'

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
