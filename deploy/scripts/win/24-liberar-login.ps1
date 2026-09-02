# ============================================================
# Renostter - Etapa 24: zerar o contador de tentativas de login
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\24-liberar-login.ps1
#
# "Too many login attempts." vem de careers/views.py:
#   _is_rate_limited(request, "login", limit=8, window_seconds=900)
# O contador fica no Redis, com chave rl:login:<ip-real-do-visitante>.
# O Django prefixa as chaves de cache, entao o nome real vira :1:rl:login:<ip>.
#
# Apaga APENAS as chaves de rate limit. Sessoes e demais caches ficam intactos.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "24-liberar-login.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Contadores ativos agora"
RemScript @'
echo "-- chaves de rate limit no Redis --"
docker exec renostter-redis redis-cli -n 1 --scan --pattern "*rl:*" | sed "s/^/  /"
n=$(docker exec renostter-redis redis-cli -n 1 --scan --pattern "*rl:*" | wc -l)
echo "  total: $n"
'@

Sec "2. Apaga so os contadores de login e de reset de senha"
RemScript @'
apagadas=0
for k in $(docker exec renostter-redis redis-cli -n 1 --scan --pattern "*rl:*"); do
  docker exec renostter-redis redis-cli -n 1 DEL "$k" >/dev/null
  echo "  apagada: $k"
  apagadas=$((apagadas+1))
done
echo "  removidas: $apagadas"
echo "-- restante --"
docker exec renostter-redis redis-cli -n 1 --scan --pattern "*rl:*" | sed "s/^/  /"
echo "CONTADOR_ZERADO"
'@

Sec "3. A pagina de login responde?"
RemScript @'
c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" https://carreiras.renostter.com/admin/login/)
echo "  GET /admin/login/ -> HTTP $c"
'@

Write-Host ""
Write-Host "Pronto. Agora tente entrar - com o valor real da senha." -ForegroundColor Green
Write-Host "Para ver o valor:" -ForegroundColor Cyan
Write-Host "  (Select-String -Path .\deploy\.env -Pattern '^MASTER_PASSWORD=').Line -replace '^MASTER_PASSWORD=',''" -ForegroundColor Gray
Stop-Transcript | Out-Null
