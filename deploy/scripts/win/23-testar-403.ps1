# ============================================================
# Renostter - Etapa 23: o 403 e por causa do CLIENTE ou do CAMINHO?
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\23-testar-403.ps1
#
# Duas familias de causa, e o teste separa antes de voce abrir o painel:
#
#  A) Bloqueio por CLIENTE (Bot Fight Mode / Browser Integrity Check)
#     -> com User-Agent de curl da 403, com UA de navegador da 200
#     -> nao afeta pessoas, so ferramentas. Baixa urgencia.
#
#  B) Bloqueio por CAMINHO (WAF Managed/Custom Rule, ou Access)
#     -> 403 com qualquer UA
#     -> afeta voce tentando entrar no admin. Precisa de excecao.
#
# So faz requisicao. Nao altera nada.
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "23-testar-403.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Mesma rota, User-Agents diferentes"
RemScript @'
UA_CHROME="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
ACC="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

printf "%-26s %-38s %s\n" "ROTA" "USER-AGENT" "HTTP"
for p in /trabalhe-conosco/ /admin/login/; do
  c1=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://carreiras.renostter.com$p")
  printf "%-26s %-38s %s\n" "$p" "curl (padrao)" "$c1"
  c2=$(curl -s -o /dev/null -m 25 -w "%{http_code}" \
        -H "User-Agent: $UA_CHROME" -H "Accept: $ACC" \
        -H "Accept-Language: pt-BR,pt;q=0.9" \
        "https://carreiras.renostter.com$p")
  printf "%-26s %-38s %s\n" "$p" "Chrome (simulado)" "$c2"
done
'@

Sec "2. Veredito"
RemScript @'
UA_CHROME="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
a=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "https://carreiras.renostter.com/admin/login/")
b=$(curl -s -o /dev/null -m 25 -w "%{http_code}" -H "User-Agent: $UA_CHROME" "https://carreiras.renostter.com/admin/login/")
echo "curl padrao : $a"
echo "UA de Chrome: $b"
echo
if [ "$a" = "403" ] && [ "$b" = "200" ]; then
  echo "VEREDITO: bloqueio por CLIENTE (Bot Fight Mode / Browser Integrity Check)."
  echo "  Pessoas em navegador NAO sao afetadas. Prioridade baixa."
elif [ "$a" = "403" ] && [ "$b" = "403" ]; then
  echo "VEREDITO: bloqueio por CAMINHO (regra de WAF ou Cloudflare Access)."
  echo "  Isso te impede de entrar no admin. Precisa de excecao no painel."
else
  echo "VEREDITO: inconclusivo - me mande a tabela acima."
fi
'@

Sec "3. Corpo da resposta bloqueada (a pagina da Cloudflare se identifica)"
RemScript @'
curl -s -m 25 "https://carreiras.renostter.com/admin/login/" \
  | grep -oiE "cloudflare|ray id|blocked|access denied|bot|firewall|error 10[0-9]{2}|challenge" \
  | sort -u | head -10 | sed "s/^/  /"
echo "  --- cf-ray desta tentativa (use para filtrar em Security Events) ---"
curl -s -I -m 25 "https://carreiras.renostter.com/admin/login/" | grep -i "cf-ray\|cf-mitigated" | sed "s/^/  /"
'@

Write-Host ""
Write-Host "Nada foi alterado. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
