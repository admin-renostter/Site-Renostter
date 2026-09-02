# Renostter — Deploy na VPS Integrator

Esta pasta contém **tudo que você precisa** para rodar o Renostter Careers (Django) na VPS ICP Power da Integrator.

## 📂 Estrutura

```
deploy/
├── docker-compose.yml         # Stack completa: Django, Postgres, Redis, Nginx, Portainer, Uptime Kuma, Cloudflare
├── .env.example               # Template de variáveis (COPIE para .env)
├── nginx/
│   ├── nginx.conf             # Config global do Nginx
│   └── conf.d/
│       └── renostter.conf     # Vhost do Django (proxy reverso)
├── cloudflared/
│   └── config.yml             # Rotas do Cloudflare Tunnel
├── scripts/
│   ├── deploy-all.sh          # 🚀 Orquestrador one-shot (hardening + up + tunnel + cron)
│   ├── hardening.sh           # 🔒 UFW, fail2ban, SSH, sysctl
│   ├── cloudflared-setup.sh   # 🌐 Cria tunnel e rotas DNS
│   ├── backup.sh              # 💾 Dump + B2 + retenção
│   ├── restore.sh             # 💾 Restaura a partir de um backup
│   ├── migrate-from-render.sh # 🔄 Migra dados do Render → VPS
│   └── postgres-init/
│       └── 01-extensions.sql  # Extensões do Postgres
├── scripts/push-to-vps.ps1    # 📤 PowerShell: envia arquivos do Windows pra VPS
└── uptime-kuma/
    └── monitors.json          # Monitors prontos para importar
```

## 🚀 Quick Start

### A. Enviar arquivos do Windows (RECOMENDADO)

Do PowerShell, na raiz do projeto:

```powershell
.\deploy\scripts\push-to-vps.ps1 -VpsHost ubuntu@<IP-DA-VPS>
```

Isso sobe `deploy/` + `django-trabalhe-conosco/` (sem `.venv`, `.env`, `db.sqlite3`).

### B. Ou manual via SCP

```bash
# Do Windows (Git Bash / WSL)
scp -r deploy/ usuario@vps:/tmp/
ssh usuario@vps

# Na VPS:
sudo bash /tmp/deploy/scripts/hardening.sh
sudo mkdir -p /opt/renostter
sudo cp -r /tmp/deploy /opt/renostter/
sudo cp /opt/renostter/deploy/.env.example /opt/renostter/deploy/.env
sudo chown -R $USER:$USER /opt/renostter
```

### C. Deploy orquestrado (one-shot)

```bash
ssh usuario@vps
sudo bash /opt/renostter/deploy/scripts/deploy-all.sh
```

Esse script executa em ordem, com confirmações:
1. `hardening.sh` (UFW, fail2ban, SSH)
2. Valida `.env`
3. `docker compose up -d`
4. Aguarda health check
5. `cloudflared-setup.sh` (tunnel + DNS)
6. Configura cron de backup

### 2. Configure o `.env`

```bash
cd /opt/renostter/deploy
nano .env
# Preencha: POSTGRES_PASSWORD, SECRET_KEY, SUPABASE_*, CLOUDFLARE_TUNNEL_TOKEN
```

### 3. Sobe a stack

```bash
docker compose up -d
docker compose logs -f web
```

### 4. Configure o Cloudflare Tunnel

```bash
sudo bash /opt/renostter/deploy/scripts/cloudflared-setup.sh
```

### 5. Configure backup automático

```bash
# Adiciona no crontab
crontab -e
# Esta linha:
0 3 * * * /opt/renostter/deploy/scripts/backup.sh >> /var/log/renostter-backup.log 2>&1
```

### 6. Importe os monitors no Uptime Kuma

Acesse `https://status.renostter.com` (primeiro acesso cria admin) → **Settings → Backup → Restore** → cole o conteúdo de `uptime-kuma/monitors.json`.

## 📋 Comandos úteis

```bash
# Status da stack
docker compose -f /opt/renostter/deploy/docker-compose.yml ps

# Logs em tempo real
docker compose -f /opt/renostter/deploy/docker-compose.yml logs -f

# Reiniciar um serviço
docker compose -f /opt/renostter/deploy/docker-compose.yml restart web

# Entrar no container do Django
docker compose -f /opt/renostter/deploy/docker-compose.yml exec web bash

# Django shell
docker compose -f /opt/renostter/deploy/docker-compose.yml exec web python manage.py shell

# Backup manual
bash /opt/renostter/deploy/scripts/backup.sh

# Restore (do último backup)
bash /opt/renostter/deploy/scripts/restore.sh
```

## 📖 Documentação completa

Veja: `../docs/DEPLOY_VPS_INTEGRATOR.md`
