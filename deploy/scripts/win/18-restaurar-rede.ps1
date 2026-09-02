# ============================================================
# Renostter - Etapa 18: restaurar a rede dos containers
# ============================================================
#   powershell -ExecutionPolicy Bypass -File .\deploy\scripts\win\18-restaurar-rede.ps1
#
# SINTOMA: todas as rotas publicas voltaram 530 (Cloudflare: origem
# inalcancavel), inclusive status e portainer que funcionavam antes.
# O healthz LOCAL continua 200, entao a stack esta viva - quem sumiu foi a
# saida para a internet.
#
# CAUSA: "firewall-cmd --reload" no hardening. O firewalld reescreve as
# cadeias do iptables e APAGA as cadeias que o Docker cria (DOCKER,
# DOCKER-USER, mascaramento da bridge). Os containers ficam sem rota de
# saida, o cloudflared nao consegue falar com o edge da Cloudflare, e a
# Cloudflare responde 530 para todo mundo.
#
# CORRECAO: reiniciar o Docker, que recria as proprias regras.
# Efeito colateral util: passa a valer o daemon.json (rotacao de log).
# ============================================================

$ErrorActionPreference = "Continue"
$root   = Resolve-Path "$PSScriptRoot\..\..\.."
$logDir = Join-Path $root "deploy\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir "18-restaurar-rede.log") -Force | Out-Null

$VpsIp   = "184.107.156.130"
$KeyPath = Join-Path $HOME ".ssh\id_ed25519_renostter"
$SSH = @("-o","BatchMode=yes","-o","IdentitiesOnly=yes","-o","ServerAliveInterval=15","-i",$KeyPath)
function Sec($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function RemScript($s) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
    & ssh @SSH "root@$VpsIp" "echo $b64 | base64 -d | bash" 2>&1 | ForEach-Object { Write-Host $_ }
}

Sec "1. Confirmar a hipotese antes de agir"
RemScript @'
echo "-- as cadeias do Docker ainda existem no iptables? --"
iptables -t nat -L DOCKER -n >/dev/null 2>&1 && echo "  nat/DOCKER: existe" || echo "  nat/DOCKER: SUMIU"
iptables -L DOCKER-USER -n >/dev/null 2>&1 && echo "  DOCKER-USER: existe" || echo "  DOCKER-USER: SUMIU"
echo
echo "-- um container consegue sair para a internet? --"
docker run --rm --network renostter_renostter-net alpine:3 sh -c "nslookup cloudflare.com >/dev/null 2>&1 && echo '  DNS do container: OK' || echo '  DNS do container: FALHOU'" 2>&1 | tail -2
echo
echo "-- o cloudflared esta reclamando de que? --"
docker logs --tail=15 renostter-cloudflared 2>&1 | sed "s/^/  /"
'@

Sec "2. Reinicia o Docker (containers voltam sozinhos)"
RemScript @'
systemctl restart docker
sleep 15
echo "docker: $(systemctl is-active docker)"
'@

Sec "3. Sobe o que nao voltou sozinho"
RemScript @'
cd /opt/renostter/deploy
docker compose up -d 2>&1 | tail -20
'@

Sec "4. Espera o tunel reconectar"
RemScript @'
for i in $(seq 1 18); do
  sleep 10
  if docker logs --since 3m renostter-cloudflared 2>&1 | grep -qiE "Registered tunnel connection"; then
    echo TUNEL_RECONECTADO; break
  fi
  echo "[$i] aguardando o tunel..."
done
docker logs --tail=12 renostter-cloudflared 2>&1 | sed "s/^/  /"
'@

Sec "5. As rotas publicas voltaram?"
RemScript @'
for u in https://carreiras.renostter.com/healthz/ \
         https://carreiras.renostter.com/trabalhe-conosco/ \
         https://carreiras.renostter.com/admin/login/ \
         https://status.renostter.com/ \
         https://portainer.renostter.com/ ; do
  c=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "$u")
  printf "%-50s -> HTTP %s\n" "$u" "$c"
done
'@

Sec "6. Estado final"
RemScript @'
cd /opt/renostter/deploy && docker compose ps --format "table {{.Name}}\t{{.Status}}"
curl -s -o /dev/null -m 15 -w "healthz local -> HTTP %{http_code}\n" -H "Host: carreiras.renostter.com" http://127.0.0.1:8080/healthz/
echo "rotacao de log do Docker agora ativa:"; docker info 2>/dev/null | grep -i "logging driver"
'@

Write-Host ""
Write-Host "Fim. Me avise no chat." -ForegroundColor Cyan
Stop-Transcript | Out-Null
