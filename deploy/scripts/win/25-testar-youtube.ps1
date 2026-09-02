# ============================================================
# Renostter - Etapa 25: por que a galeria cai no fallback estatico?
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\25-testar-youtube.ps1
#
# Os 4 videos que aparecem no site sao exatamente os do STATIC_FALLBACK em
# js/portfolio.js. Isso significa que fetchViaProxy() E fetchDirect() falharam.
#
# fetchDirect ja esta descartado: YT_FALLBACK_KEY = '' (chave removida do
# codigo de proposito, o que esta certo - chave de API nao vai em JS publico).
# Entao tudo depende do Worker. Este script testa o Worker de fora, a partir
# da VPS, que tem internet livre.
#
# Nao altera nada.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "25-testar-youtube.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. O Worker responde?"
RemScript @'
U="https://renostter-gemini-proxy.adminrenostter.workers.dev/youtube?channelId=UCPdh_nMh4XLdkVRH1jn7LuA&maxResults=12"
echo "-- codigo HTTP --"
curl -s -o /tmp/yt.json -m 25 -w "  HTTP %{http_code}  |  %{size_download} bytes\n" "$U"
echo "-- corpo da resposta (primeiros 600 chars) --"
head -c 600 /tmp/yt.json | sed "s/^/  /"
echo
'@

Sec "2. Quantos videos vieram?"
RemScript @'
if command -v python3 >/dev/null; then
  python3 - <<PYEOF
import json
try:
    d = json.load(open("/tmp/yt.json"))
except Exception as e:
    print("  resposta nao e JSON valido:", e); raise SystemExit
if "error" in d:
    print("  ERRO DA API:", json.dumps(d["error"])[:400])
items = d.get("items") or []
print("  itens retornados:", len(items))
for it in items[:12]:
    vid = (it.get("id") or {}).get("videoId", "?")
    tit = (it.get("snippet") or {}).get("title", "?")
    print(f"   - {vid}  {tit[:60]}")
if not items:
    print("  >> lista vazia: o site vai cair no STATIC_FALLBACK (4 videos fixos)")
PYEOF
else
  echo "  (sem python3 - veja o corpo bruto acima)"
fi
'@

Sec "3. A raiz do Worker esta viva? (separa 'Worker fora' de 'rota /youtube quebrada')"
RemScript @'
for p in "" "/youtube"; do
  c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "https://renostter-gemini-proxy.adminrenostter.workers.dev$p")
  printf "  %-12s -> HTTP %s\n" "${p:-/}" "$c"
done
'@

Sec "4. Os 4 videos do fallback ainda existem no YouTube?"
RemScript @'
for id in Emgg1jkWolE 2-A3Gwn6YJg 99aP656ShAM J5XsSC7xB3s; do
  c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "https://i.ytimg.com/vi/$id/hqdefault.jpg")
  printf "  %-14s thumbnail -> HTTP %s\n" "$id" "$c"
done
'@

Write-Host ""
Write-Host "Nada foi alterado. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
