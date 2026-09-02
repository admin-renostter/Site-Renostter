# ============================================================
# Renostter - Etapa 13: o banco do Render ainda existe?
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\13-testar-render.ps1
#
# NAO migra nada. So descobre se da para conectar e o que tem la dentro.
# O host foi transcrito de um print, e 1/l/I sao faceis de confundir - por isso
# este passo existe separado, antes de qualquer coisa destrutiva.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "13-testar-render.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Envia o .env atualizado"
& scp @SSH (Join-Path $root "deploy\.env") "root@${VpsIp}:/opt/renostter/deploy/.env" 2>&1 | ForEach-Object { Write-Host $_ }
RemScript @'
chmod 600 /opt/renostter/deploy/.env
echo "chaves preenchidas (sem mostrar valores):"
grep -oE "^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|RENDER_EXTERNAL_DATABASE_URL)=" /opt/renostter/deploy/.env
'@

Sec "2. O host do Render resolve no DNS?"
RemScript @'
# Le a variavel sem "source": o .env nao e script shell.
URL=$(grep -E "^RENDER_EXTERNAL_DATABASE_URL=" /opt/renostter/deploy/.env | head -1 | cut -d= -f2-)
URL="${URL%\"}"; URL="${URL#\"}"
if [ -z "$URL" ]; then echo "VARIAVEL_VAZIA - a linha nao existe no .env"; exit 0; fi
HOST=$(echo "$URL" | sed -E "s|.*@([^/:]+).*|\1|")
echo "host extraido: $HOST"
if getent hosts "$HOST" >/dev/null 2>&1; then
  echo "DNS OK -> $(getent hosts "$HOST" | head -1)"
else
  echo "DNS_FALHOU"
  echo "  O hostname nao existe. Provavelmente transcrevi 1/l/I errado do print,"
  echo "  ou o banco foi removido. Pegue a External Database URL exata no painel."
  exit 0
fi
'@

Sec "3. Conecta e inventaria (somente leitura)"
RemScript @'
URL=$(grep -E "^RENDER_EXTERNAL_DATABASE_URL=" /opt/renostter/deploy/.env | head -1 | cut -d= -f2-)
URL="${URL%\"}"; URL="${URL#\"}"
PGIMG=postgres:16-alpine
echo "-- tentando conectar --"
if docker run --rm -e PGCONNECT_TIMEOUT=15 "$PGIMG" psql "$URL" -c "SELECT version();" 2>&1 | head -5; then
  echo "CONEXAO_OK"
else
  echo "CONEXAO_FALHOU"
  echo "  (se a mensagem citar /var/run/postgresql/.s.PGSQL.5432, a URL chegou vazia)"
fi
echo
echo "-- quantas linhas em cada tabela --"
docker run --rm -e PGCONNECT_TIMEOUT=15 "$PGIMG" psql "$URL" -t -c \
  "SELECT relname || ' = ' || n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;" 2>&1 | sed "s/^/   /" | head -30
echo
echo "-- os numeros que interessam --"
docker run --rm -e PGCONNECT_TIMEOUT=15 "$PGIMG" psql "$URL" -t -c \
  "SELECT 'vagas=' || (SELECT count(*) FROM careers_job) ||
          ' | candidaturas=' || (SELECT count(*) FROM careers_application) ||
          ' | usuarios=' || (SELECT count(*) FROM auth_user);" 2>&1 | sed "s/^/   /"
'@

Write-Host ""
Write-Host "Nada foi alterado. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
