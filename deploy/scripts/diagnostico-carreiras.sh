#!/usr/bin/env bash
# ==========================================================================
#  diagnostico-carreiras.sh — por que carreiras.renostter.com responde 502
#  SOMENTE LEITURA. Não reinicia, não altera, não remove nada.
# ==========================================================================
set -uo pipefail
cd /opt/renostter/deploy 2>/dev/null || { echo "!! /opt/renostter/deploy nao encontrado"; exit 1; }

t() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

echo "DIAGNOSTICO — $(date '+%d/%m/%Y %H:%M:%S %Z')"

t "1. Estado dos containers"
docker compose ps --format 'table {{.Name}}\t{{.State}}\t{{.Status}}\t{{.Ports}}' 2>&1

t "2. Quem reiniciou e quantas vezes"
for c in $(docker compose ps -aq 2>/dev/null); do
  docker inspect "$c" --format '  {{.Name}}  reinicios={{.RestartCount}}  saude={{if .State.Health}}{{.State.Health.Status}}{{else}}sem healthcheck{{end}}  saiu={{.State.ExitCode}}  desde={{.State.StartedAt}}' 2>/dev/null
done

t "3. Recursos da maquina"
free -h | sed 's/^/  /'
echo
df -h / /var/lib/docker 2>/dev/null | sed 's/^/  /'
echo
echo "  --- maiores diretorios em /var/lib/docker ---"
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head -5 | sed 's/^/  /'

t "4. web (Django/gunicorn) — ultimas 40 linhas"
docker compose logs --tail=40 --no-color web 2>&1 | sed 's/^/  /'

t "5. nginx — ultimas 25 linhas"
docker compose logs --tail=25 --no-color nginx 2>&1 | sed 's/^/  /'

t "6. postgres — ultimas 20 linhas"
docker compose logs --tail=20 --no-color postgres 2>&1 | sed 's/^/  /'

t "7. worker — ultimas 15 linhas"
docker compose logs --tail=15 --no-color worker 2>&1 | sed 's/^/  /'

t "8. cloudflared — ultimas 20 linhas"
docker compose logs --tail=20 --no-color cloudflared 2>&1 | sed 's/^/  /'

t "9. Teste por dentro da rede Docker"
echo "  nginx -> web:8000/healthz/"
docker compose exec -T nginx sh -c 'wget -qO- -T5 http://web:8000/healthz/ 2>&1 || echo "  FALHOU"' 2>&1 | sed 's/^/    /'
echo "  cloudflared -> nginx:80"
docker compose exec -T cloudflared sh -c 'wget -qO- -T5 http://nginx:80/healthz/ 2>&1 || echo "  FALHOU"' 2>&1 | sed 's/^/    /'
echo "  host -> 127.0.0.1:8080 (nginx publicado)"
curl -s -m 5 -o /dev/null -w '    HTTP %{http_code}\n' http://127.0.0.1:8080/healthz/ 2>&1 || echo "    FALHOU"

t "10. Docker e firewall (causa conhecida de queda anterior)"
echo "  cadeias DOCKER no iptables:"
iptables -t nat -L DOCKER -n 2>/dev/null | head -3 | sed 's/^/    /' || echo "    AUSENTE — sintoma de firewall-cmd --reload sem reiniciar o docker"
echo "  ultimo reload do firewalld:"
journalctl -u firewalld --since '30 days ago' 2>/dev/null | grep -ci reload | sed 's/^/    reloads: /'

t "11. A maquina reiniciou recentemente?"
uptime -p 2>/dev/null | sed 's/^/  /'
last reboot 2>/dev/null | head -3 | sed 's/^/  /'

echo
echo "=========================================================="
echo "Fim. Nada foi alterado. Me mande este log inteiro."
echo "=========================================================="
