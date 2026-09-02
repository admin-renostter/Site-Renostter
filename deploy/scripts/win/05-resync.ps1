# ============================================================
# Renostter - Etapa 5: reenvia TUDO com verificacao de integridade
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\05-resync.ps1
#
# O manage.py chegou na VPS com null bytes, mas no Windows ele esta intacto.
# Este script compara hash na origem e no destino para achar onde corrompe.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "05-resync.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=30","-i",$KeyPath)

function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Rem($c) { & ssh @SSH "root@$VpsIp" $c 2>&1 | ForEach-Object { Write-Host $_ } }

Sec "1. Como esta o arquivo AGORA na VPS"
$diag = @'
cd /opt/renostter/django-trabalhe-conosco 2>/dev/null || { echo SEM_PASTA; exit 0; }
echo "-- manage.py --"
wc -c manage.py
sha256sum manage.py | cut -c1-16
head -c 32 manage.py | od -c | head -3
echo "-- quantos .py tem null byte --"
find . -name "*.py" -exec grep -lIZ . {} + >/dev/null 2>&1
n=0; for f in $(find . -name "*.py"); do if LC_ALL=C grep -qP "\x00" "$f" 2>/dev/null; then n=$((n+1)); echo "  NULL $f"; fi; done
echo "total com null: $n"
'@
& ssh @SSH "root@$VpsIp" $diag 2>&1 | ForEach-Object { Write-Host $_ }

Sec "2. Hash na ORIGEM (Windows)"
# Referencia esperada:
#   manage.py        ac0c759b5c209ce1   285 bytes
#   start.sh         3274ae4bdbf43ce2   574 bytes
#   requirements.txt 82d7df3c8d3a765d   509 bytes
foreach ($f in @("django-trabalhe-conosco\manage.py","django-trabalhe-conosco\start.sh","django-trabalhe-conosco\requirements.txt")) {
    $p = Join-Path $root $f
    $h = (Get-FileHash $p -Algorithm SHA256).Hash.ToLower().Substring(0,16)
    $b = (Get-Item $p).Length
    Write-Host ("{0,-50} {1}  {2} bytes" -f $f, $h, $b)
}

Sec "2b. Hidrata arquivos do OneDrive"
# CAUSA RAIZ do manage.py zerado: com Arquivos Sob Demanda, o OneDrive deixa
# no disco um placeholder com o tamanho certo mas sem conteudo. O tar leu 285
# bytes de zeros. Ler cada arquivo forca o download antes de empacotar.
$n = 0
Get-ChildItem -Path (Join-Path $root "django-trabalhe-conosco") -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(\.venv|__pycache__|staticfiles|private_media)\\" } |
  ForEach-Object { try { $null = [System.IO.File]::ReadAllBytes($_.FullName); $n++ } catch {} }
Write-Host "$n arquivos hidratados"

Sec "3. Reempacota do zero"
# Sem splatting em $args (nome reservado do PowerShell) e sem tocar no stream.
$tar = Join-Path $env:TEMP "renostter-full.tar.gz"
Remove-Item $tar -Force -ErrorAction SilentlyContinue
$ex = @(
  "--exclude=django-trabalhe-conosco/.venv","--exclude=django-trabalhe-conosco/.env",
  "--exclude=django-trabalhe-conosco/db.sqlite3","--exclude=django-trabalhe-conosco/private_media",
  "--exclude=django-trabalhe-conosco/lancedb","--exclude=django-trabalhe-conosco/audit",
  "--exclude=django-trabalhe-conosco/logs","--exclude=django-trabalhe-conosco/staticfiles",
  "--exclude=deploy/logs","--exclude=deploy/_backup-pre-fix",
  "--exclude=.git","--exclude=__pycache__","--exclude=*.pyc","--exclude=.pytest_cache",
  "--exclude=.vscode","--exclude=.idea","--exclude=*.bak"
)
& tar -czf $tar $ex -C $root "deploy" "django-trabalhe-conosco"
Write-Host ("pacote: {0} bytes" -f (Get-Item $tar).Length)
Write-Host ("sha256: {0}" -f (Get-FileHash $tar -Algorithm SHA256).Hash.ToLower().Substring(0,16))

Sec "4. Envia e confere o pacote em transito"
& scp @SSH $tar "root@${VpsIp}:/tmp/full.tar.gz" 2>&1 | ForEach-Object { Write-Host $_ }
Rem "echo -n 'sha256 na VPS: '; sha256sum /tmp/full.tar.gz | cut -c1-16; echo -n 'bytes: '; wc -c < /tmp/full.tar.gz"

Sec "5. Extrai por cima e confere de novo"
$extract = @'
cd /opt/renostter
rm -rf django-trabalhe-conosco
tar xzf /tmp/full.tar.gz
rm -f /tmp/full.tar.gz
find . -type d -exec chmod 755 {} +
find . -type f -exec chmod 644 {} +
chmod +x deploy/scripts/*.sh django-trabalhe-conosco/start.sh
chmod 600 deploy/.env
echo "-- depois da extracao --"
cd django-trabalhe-conosco
wc -c manage.py
sha256sum manage.py | cut -c1-16
head -c 32 manage.py | od -c | head -3
n=0; for f in $(find . -name "*.py"); do if LC_ALL=C grep -qP "\x00" "$f" 2>/dev/null; then n=$((n+1)); fi; done
echo "arquivos .py com null byte: $n"
if [ "$n" -eq 0 ]; then echo INTEGRIDADE_OK; else echo INTEGRIDADE_FALHOU; fi
'@
& ssh @SSH "root@$VpsIp" $extract 2>&1 | ForEach-Object { Write-Host $_ }

Sec "6. Rebuild e sobe"
Rem "cd /opt/renostter/deploy && docker compose build web 2>&1 | tail -12 && docker compose up -d --force-recreate web worker nginx 2>&1 | tail -20"

Sec "7. Aguarda"
$wait = @'
for i in $(seq 1 10); do
  sleep 10
  st=$(cd /opt/renostter/deploy && docker compose ps --format '{{.Name}} {{.Status}}')
  echo "[$i]"; echo "$st"
  if echo "$st" | grep -q "renostter-nginx.*Up"; then echo NGINX_NO_AR; break; fi
done
'@
& ssh @SSH "root@$VpsIp" $wait 2>&1 | ForEach-Object { Write-Host $_ }

Sec "8. Healthcheck"
Rem "curl -fsS -m 10 -o /dev/null -w 'healthz HTTP %{http_code}\n' -H 'Host: carreiras.renostter.com' http://127.0.0.1:8080/healthz/ || echo HEALTHZ_FALHOU"

Sec "9. Logs"
Rem "cd /opt/renostter/deploy && echo '--- web ---'; docker compose logs --tail=40 web; echo '--- nginx ---'; docker compose logs --tail=15 nginx"

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
