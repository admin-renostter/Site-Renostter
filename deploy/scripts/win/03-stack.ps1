# ============================================================
# Renostter - Etapa 3: verifica, corrige permissoes e sobe a stack
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\03-stack.ps1
#
# NAO sobe o cloudflared (ele so funciona depois do setup do tunnel, etapa 4)
# e NAO mexe em firewall nem SSH (isso e a etapa 5, interativa).
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "03-stack.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$R       = "/opt/renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($cmd) { & ssh @SSH "root@$VpsIp" $cmd 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Os arquivos chegaram inteiros?"
# O pacote saiu com 0.1 MB, o que e pequeno. Aqui eu confirmo item por item
# em vez de assumir - se faltar algo, o build falharia so la na frente.
$check = @'
cd /opt/renostter || { echo "FALTA_RAIZ"; exit 1; }
miss=0
for f in django-trabalhe-conosco/manage.py \
         django-trabalhe-conosco/Dockerfile \
         django-trabalhe-conosco/requirements.txt \
         django-trabalhe-conosco/start.sh \
         deploy/docker-compose.yml \
         deploy/.env \
         deploy/nginx/nginx.conf \
         deploy/nginx/conf.d/renostter.conf \
         deploy/nginx/conf.d/proxy_backend.inc \
         deploy/cloudflared/config.yml \
         deploy/scripts/postgres-init/01-extensions.sql ; do
  if [ -f "$f" ]; then printf "ok    %s\n" "$f"; else printf "FALTA %s\n" "$f"; miss=1; fi
done
echo "--- pastas do app ---"
ls -d django-trabalhe-conosco/*/ 2>/dev/null
echo "--- tamanho total ---"; du -sh django-trabalhe-conosco deploy
echo "--- arquivos python ---"; find django-trabalhe-conosco -name "*.py" | wc -l
echo "--- templates ---"; find django-trabalhe-conosco -name "*.html" | wc -l
[ "$miss" -eq 0 ] && echo VERIFICACAO_OK || echo VERIFICACAO_FALHOU
'@
$v = & ssh @SSH "root@$VpsIp" $check 2>&1
$v | ForEach-Object { Write-Host $_ }
if (-not ($v -match "VERIFICACAO_OK")) {
    Write-Host ""
    Write-Host "Faltou arquivo. Nao vou subir nada. Me mande o log." -ForegroundColor Red
    Stop-Transcript | Out-Null; exit 1
}

Sec "2. Normaliza permissoes"
# O tar veio do OneDrive/Windows e trouxe modos estranhos: pastas 555 e
# arquivos 666 (todo mundo escreve). Deixa sensato antes de rodar qualquer coisa.
Rem "cd $R && chown -R root:root . && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} + && chmod +x deploy/scripts/*.sh django-trabalhe-conosco/start.sh && chmod 600 deploy/.env && echo PERMISSOES_OK && ls -la deploy | head -12"

Sec "3. Build da imagem (pode levar 3-6 min)"
Rem "cd $R/deploy && docker compose build web 2>&1 | tail -40"

Sec "4. Sobe a stack (sem o cloudflared)"
# O cloudflared ainda nao tem credencial do tunnel - subiria em crash loop.
Rem "cd $R/deploy && docker compose up -d postgres redis web worker nginx portainer uptime-kuma 2>&1 | tail -30"

Sec "5. Aguarda estabilizar"
Rem "sleep 25; cd $R/deploy && docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"

Sec "6. Healthcheck"
Rem "curl -fsS -m 10 -o /dev/null -w 'healthz HTTP %{http_code}\n' -H 'Host: carreiras.renostter.com' http://127.0.0.1:8080/healthz/ || echo 'HEALTHZ_FALHOU'"

Sec "7. Logs recentes (web e worker)"
Rem "cd $R/deploy && echo '--- web ---' && docker compose logs --tail=40 web && echo '--- worker ---' && docker compose logs --tail=20 worker && echo '--- nginx ---' && docker compose logs --tail=15 nginx"

Write-Host ""
Write-Host "Fim. Me avise no chat que eu leio o log e digo o proximo passo." -ForegroundColor Cyan
Stop-Transcript | Out-Null
