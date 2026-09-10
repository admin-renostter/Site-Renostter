#!/usr/bin/env bash
# ==========================================================================
#  audit-seguranca.sh — inventário de segurança da VPS Renostter
#  Somente LEITURA. Não instala, não altera, não reinicia nada.
#  Uso: bash audit-seguranca.sh
# ==========================================================================
set -uo pipefail

titulo() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
item()   { printf '  %-34s %s\n' "$1" "$2"; }
tem()    { command -v "$1" >/dev/null 2>&1 && echo "sim" || echo "NAO"; }
ativo()  { systemctl is-active "$1" 2>/dev/null || echo "ausente"; }
hab()    { systemctl is-enabled "$1" 2>/dev/null || echo "-"; }

echo "RELATORIO DE SEGURANCA — $(date '+%d/%m/%Y %H:%M:%S %Z')"
echo "host: $(hostname)"

titulo "1. Máquina"
item "Sistema"      "$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
item "Kernel"       "$(uname -r)"
item "Uptime"       "$(uptime -p 2>/dev/null || uptime)"
item "vCPU"         "$(nproc)"
item "RAM total"    "$(free -h | awk '/^Mem:/{print $2}')"
item "RAM livre"    "$(free -h | awk '/^Mem:/{print $7" disponivel"}')"
item "Swap"         "$(free -h | awk '/^Swap:/{print $2}')"
item "Disco /"      "$(df -h / | awk 'NR==2{print $3" usados de "$2" ("$5")"}')"

titulo "2. Controles que já existem"
item "firewalld"        "$(ativo firewalld) / boot: $(hab firewalld)"
item "fail2ban"         "$(ativo fail2ban) / boot: $(hab fail2ban)"
item "SELinux"          "$(getenforce 2>/dev/null || echo ausente)"
item "auditd"           "$(ativo auditd)"
item "dnf-automatic"    "$(ativo dnf-automatic.timer) / boot: $(hab dnf-automatic.timer)"
if [[ -f /etc/dnf/automatic.conf ]]; then
  item "  tipo de update"  "$(grep -E '^upgrade_type' /etc/dnf/automatic.conf | head -1)"
  item "  aplica sozinho"  "$(grep -E '^apply_updates' /etc/dnf/automatic.conf | head -1)"
fi

titulo "3. Firewall — o que está aberto"
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --list-all 2>/dev/null | sed 's/^/  /'
else
  echo "  firewall-cmd ausente"
fi

titulo "4. Portas ouvindo (0.0.0.0 = exposto à internet)"
ss -tulpnH 2>/dev/null | awk '{printf "  %-6s %-24s %s\n", $1, $5, $7}' | sort -u | head -30

titulo "5. fail2ban — jails e banimentos"
if command -v fail2ban-client >/dev/null 2>&1; then
  jails=$(fail2ban-client status 2>/dev/null | awk -F: '/Jail list/{print $2}' | tr -d ' ')
  item "Jails ativas" "${jails:-nenhuma}"
  for j in ${jails//,/ }; do
    tot=$(fail2ban-client status "$j" 2>/dev/null | awk -F: '/Total banned/{print $2}' | tr -d ' ')
    atu=$(fail2ban-client status "$j" 2>/dev/null | awk -F: '/Currently banned/{print $2}' | tr -d ' ')
    item "  jail $j" "banidos agora: ${atu:-?} / total: ${tot:-?}"
  done
else
  item "fail2ban-client" "ausente"
fi

titulo "6. SSH"
sshd -T 2>/dev/null | grep -iE '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|maxauthtries|x11forwarding)\b' | sed 's/^/  /'
item "Tentativas falhas (24h)" "$(journalctl -u sshd --since '24 hours ago' 2>/dev/null | grep -ci 'failed password' || echo 0)"
item "Logins aceitos (24h)"    "$(journalctl -u sshd --since '24 hours ago' 2>/dev/null | grep -ci 'accepted' || echo 0)"

titulo "7. EDR / HIDS / SIEM / antimalware — o que está instalado"
for t in wazuh-agent osqueryd falco crowdsec suricata snort aide rkhunter chkrootkit clamscan freshclam auditctl tripwire ossec-control filebeat promtail vector fluent-bit; do
  item "$t" "$(tem "$t")"
done
item "wazuh (servico)"   "$(ativo wazuh-agent)"
item "crowdsec (servico)" "$(ativo crowdsec)"

titulo "8. Docker"
item "Docker"            "$(tem docker) — $(docker --version 2>/dev/null | cut -d, -f1)"
item "Containers ativos" "$(docker ps -q 2>/dev/null | wc -l)"
item "Socket exposto?"   "$(ss -tulpnH 2>/dev/null | grep -c '2375\|2376' | sed 's/^0$/nao/')"
echo "  --- containers privilegiados ou com socket montado ---"
docker ps --format '{{.Names}}' 2>/dev/null | while read -r c; do
  priv=$(docker inspect -f '{{.HostConfig.Privileged}}' "$c" 2>/dev/null)
  sock=$(docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$c" 2>/dev/null | grep -c 'docker.sock')
  [[ "$priv" == "true" || "$sock" -gt 0 ]] && printf '  %-22s privilegiado=%s docker.sock=%s\n' "$c" "$priv" "$sock"
done
echo "  --- portas publicadas em 0.0.0.0 ---"
docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -v '127.0.0.1' | grep '0.0.0.0' | sed 's/^/  /' || echo "  nenhuma"

titulo "9. Atualizações pendentes"
pend=$(dnf -q check-update 2>/dev/null | grep -cE '^[a-zA-Z0-9]' || true)
item "Pacotes desatualizados" "${pend:-0}"
item "Correcoes de seguranca" "$(dnf -q updateinfo list security 2>/dev/null | grep -c . || echo 0)"
item "Precisa reiniciar?"     "$(needs-restarting -r >/dev/null 2>&1 && echo nao || echo SIM)"

titulo "10. Contas e acesso"
item "Usuarios com shell" "$(awk -F: '$7 !~ /(nologin|false)$/ {print $1}' /etc/passwd | tr '\n' ' ')"
item "Contas sem senha"   "$(awk -F: '$2==""{print $1}' /etc/shadow 2>/dev/null | tr '\n' ' ' || echo '(sem permissao)')"
item "Chaves SSH root"    "$(wc -l < /root/.ssh/authorized_keys 2>/dev/null || echo 0)"
echo "  --- sudoers sem senha ---"
grep -rhE '^[^#].*NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null | sed 's/^/  /' || echo "  nenhum"

titulo "11. Logs e retenção"
item "Tamanho de /var/log" "$(du -sh /var/log 2>/dev/null | cut -f1)"
item "journald em disco"   "$(journalctl --disk-usage 2>/dev/null | sed 's/.*take up //')"
item "Retencao configurada" "$(grep -hE '^(SystemMaxUse|MaxRetentionSec)' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/*.conf 2>/dev/null | tr '\n' ' ' || echo 'padrao (sem limite explicito)')"
item "Envio para fora"     "$(tem rsyslog)/rsyslog — remoto: $(grep -rhcE '^\*\.\* +@' /etc/rsyslog.conf /etc/rsyslog.d/ 2>/dev/null | paste -sd+ | bc 2>/dev/null || echo 0)"

titulo "12. Backup"
item "Script de backup"  "$([[ -f /opt/renostter/deploy/scripts/backup.sh ]] && echo presente || echo 'nao encontrado em /opt/renostter')"
item "Agendado no cron"  "$(crontab -l 2>/dev/null | grep -c backup || echo 0) entrada(s)"
item "Backups locais"    "$(ls -1 /opt/renostter/backups 2>/dev/null | wc -l) arquivo(s)"
item "Mais recente"      "$(ls -1t /opt/renostter/backups 2>/dev/null | head -1 || echo '-')"
item "Destino externo"   "$(grep -sE '^B2_(BUCKET|KEY_ID)=' /opt/renostter/deploy/.env 2>/dev/null | grep -vc PREENCHER | sed 's/^0$/NAO configurado/')"

echo
echo "=========================================================="
echo "Fim do relatorio. Nada foi alterado nesta maquina."
echo "=========================================================="
