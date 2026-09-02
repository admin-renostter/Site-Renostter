# ============================================================
# Renostter - Etapa 7: invalida o snapshot de contexto do BuildKit
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\07-rebuild-limpo.ps1
#
# O fonte na VPS esta certo (ac0c759b5c209ce1) e o build rodou com --no-cache,
# mas a imagem sai com o manage.py zerado. Motivo: --no-cache desativa o cache
# de PASSOS, nao o cache de CONTEXTO. O BuildKit guarda um snapshot da pasta
# local e detecta mudanca por metadados (caminho + tamanho + mtime). O tar
# restaurou os mtimes originais, entao ele conclui "nada mudou" e reaproveita
# o snapshot antigo - o que foi capturado com os zeros do OneDrive.
#
# Solucao: mexer no mtime de todos os arquivos + limpar o cache do builder.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "07-rebuild-limpo.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($c) { & ssh @SSH "root@$VpsIp" $c 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Invalida o contexto: novo mtime em tudo"
Rem "cd /opt/renostter/django-trabalhe-conosco && find . -exec touch {} + && echo MTIME_ATUALIZADO && sha256sum manage.py | cut -c1-16 && ls -l --time-style=full-iso manage.py"

Sec "2. Limpa o cache do BuildKit"
Rem "docker builder prune -af 2>&1 | tail -5; echo CACHE_LIMPO"

Sec "3. Build"
Rem "cd /opt/renostter/deploy && docker compose build --no-cache web 2>&1 | tail -18"

Sec "4. Verifica DENTRO da imagem"
# Comparacao por hash, sem aspas aninhadas - a verificacao anterior quebrou
# justamente porque o ast.parse ia com quoting demais entre ssh, bash e docker.
$check = @'
esperado=ac0c759b5c209ce1
obtido=$(docker run --rm --entrypoint sha256sum renostter-careers:latest /app/manage.py | cut -c1-16)
echo "esperado: $esperado"
echo "obtido:   $obtido"
if [ "$obtido" = "$esperado" ]; then
  echo IMAGEM_OK
else
  echo IMAGEM_AINDA_CORROMPIDA
fi
'@
$vr = & ssh @SSH "root@$VpsIp" $check 2>&1
$vr | ForEach-Object { Write-Host $_ }

if (-not ($vr -match "IMAGEM_OK")) {
    Sec "4b. Plano B: builder classico (sem BuildKit)"
    # Se o BuildKit continuar servindo o snapshot velho, o builder antigo
    # nao tem esse cache de contexto e le a pasta na hora.
    Rem "cd /opt/renostter/django-trabalhe-conosco && DOCKER_BUILDKIT=0 docker build -t renostter-careers:latest . 2>&1 | tail -15"
    $vr2 = & ssh @SSH "root@$VpsIp" $check 2>&1
    $vr2 | ForEach-Object { Write-Host $_ }
    if (-not ($vr2 -match "IMAGEM_OK")) {
        Write-Host ""
        Write-Host "Os dois builders falharam. Nao subo container. Me mande o log." -ForegroundColor Red
        Stop-Transcript | Out-Null; exit 1
    }
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
