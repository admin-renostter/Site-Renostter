# Deploy na VPS Integrator (ICP Power)

> **Substitui o deploy no Render.** O objetivo é ter um ambiente unificado
> e sem cold start, com Django + Postgres + Redis + Worker + ferramentas
> auxiliares (Portainer, Uptime Kuma) rodando 24/7.

## 📋 Visão geral

| Item | Valor |
|---|---|
| Provedor | Integrator.com.br (plano **VPS ICP POWER**) |
| Recursos | 6 vCPU · 16 GB RAM · 200 GB NVMe · 30 TB banda |
| SO | Ubuntu 22.04 LTS (recomendado) |
| Acesso | SSH com chave (sem senha) · Cloudflare Tunnel (zero porta aberta) |
| Domínio | `carreiras.renostter.com` apontando via Cloudflare Tunnel |

## 🏗️ Arquitetura

```
┌────────────────────────────────────────────────────────┐
│  CLOUDFLARE (DNS + Proxy + SSL)                        │
│  carreiras.renostter.com  portainer.renostter.com      │
│  status.renostter.com     n8n.renostter.com (opcional) │
└──────────────────────┬─────────────────────────────────┘
                       │ tunnel (sem expor IP)
                       ▼
┌────────────────────────────────────────────────────────┐
│  VPS INTEGRATOR                                        │
│                                                         │
│  ┌───────────────────────────────────────────────┐    │
│  │ cloudflared (container)                       │    │
│  │  recebe conexões do Cloudflare                │    │
│  └──────────────────┬────────────────────────────┘    │
│                     ▼                                   │
│  ┌───────────────────────────────────────────────┐    │
│  │ nginx (container)                             │    │
│  │  reverse proxy + arquivos estáticos            │    │
│  └──────────────────┬────────────────────────────┘    │
│                     ▼                                   │
│  ┌───────────────────────────────────────────────┐    │
│  │ web (container Django + Gunicorn)             │    │
│  │  serve requisições HTTP                       │    │
│  └──────────────────┬────────────────────────────┘    │
│                     ▼                                   │
│  ┌──────────┐    ┌──────────┐    ┌────────────┐       │
│  │ postgres │◄───┤ worker   │    │ portainer  │       │
│  │  (DB)    │    │ (qcluster)│    │ (Docker UI) │       │
│  └──────────┘    └──────────┘    └────────────┘       │
│  ┌──────────┐    ┌────────────┐                       │
│  │ redis    │    │ uptime-kuma│                       │
│  │ (cache)  │    │ (monitor)  │                       │
│  └──────────┘    └────────────┘                       │
└────────────────────────────────────────────────────────┘
```

## 🚀 Passo a passo

### Etapa 1 — Acessar a VPS nova

A Integrator envia os dados de acesso por e-mail. Geralmente:

```bash
ssh root@<IP-DA-VPS>
# Senha: a que veio no e-mail
```

⚠️ Se a VPS veio como AlmaLinux, reinstale como **Ubuntu 22.04** no painel da Integrator (Cloud > Reinstalar > Ubuntu 22.04). Django + Docker funcionam muito melhor em Ubuntu.

### Etapa 2 — Hardening da VPS

Copie a pasta `deploy/` para a VPS e rode o hardening:

```bash
# No seu computador local:
scp -r Site-Renostter/deploy usuario@<IP-VPS>:/tmp/

# Na VPS:
sudo bash /tmp/deploy/scripts/hardening.sh
```

Esse script:
- ✅ Atualiza o sistema
- ✅ Configura `unattended-upgrades` (atualizações automáticas de segurança)
- ✅ Ativa UFW (firewall): só abre 22, 80, 7844
- ✅ Instala fail2ban (3 tentativas = ban 24h)
- ✅ Reforça SSH (chave obrigatória, sem root, sem senha)
- ✅ Configura sysctl anti-spoofing
- ✅ Instala Docker e Docker Compose

⚠️ **IMPORTANTE**: ANTES de continuar, adicione sua chave SSH:

```bash
# Na VPS (como root):
mkdir -p /root/.ssh
chmod 700 /root/.ssh
# Cole sua chave pública aqui:
nano /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Depois teste em outro terminal antes de fechar a sessão atual:

```bash
ssh root@<IP-VPS>   # deve entrar sem pedir senha
```

### Etapa 3 — Mover projeto para `/opt/renostter`

```bash
# Criar a estrutura
sudo mkdir -p /opt/renostter
sudo cp -r /tmp/deploy /opt/renostter/
sudo cp /opt/renostter/deploy/.env.example /opt/renostter/deploy/.env
sudo chown -R $USER:$USER /opt/renostter
```

### Etapa 4 — Configurar variáveis de ambiente

```bash
cd /opt/renostter/deploy
nano .env
```

**Obrigatório preencher** (gere valores fortes):

```bash
# Postgres
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Django
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64) if not __import__('os').environ.get('_') else '')" || openssl rand -base64 64)

# Cloudflare Tunnel (deixe vazio por enquanto; será preenchido pelo setup)
CLOUDFLARE_TUNNEL_TOKEN=

# Supabase (se for usar storage)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Backblaze B2 (para backup off-site)
B2_APPLICATION_KEY_ID=xxx
B2_APPLICATION_KEY=xxx
B2_BUCKET_NAME=renostter-backups
```

**O que JÁ é gratuito mas precisa criar conta:**

1. **Backblaze B2** (10 GB grátis, faça upload até 1 GB/dia):
   - https://www.backblaze.com/b2/cloud-storage.html
   - Crie um bucket `renostter-backups` (Private)
   - Crie uma Application Key com acesso só a esse bucket
   - Copie `keyID` e `applicationKey`

2. **Resend** (3.000 e-mails/mês grátis):
   - https://resend.com
   - Crie API Key
   - Verifique o domínio `renostter.com.br`

3. **Cloudflare** (você já tem o domínio lá)

### Etapa 5 — Subir a stack

```bash
cd /opt/renostter/deploy
docker compose up -d
docker compose ps
docker compose logs -f web
```

**Saída esperada** (espere ~60s na primeira build):
```
renostter-postgres     Up (healthy)
renostter-redis        Up (healthy)
renostter-web          Up (healthy)
renostter-worker       Up
renostter-nginx        Up
renostter-cloudflared  Up
```

**Health check local** (sem DNS ainda):
```bash
curl http://localhost/healthz/
# {"status": "ok"}
```

### Etapa 6 — Configurar Cloudflare Tunnel

```bash
sudo bash /opt/renostter/deploy/scripts/cloudflared-setup.sh
```

Esse script:
- Faz login no Cloudflare (abre URL no navegador)
- Cria o tunnel `renostter`
- Copia o `credentials.json` para o volume
- Aplica o `config.yml`
- Cria as rotas DNS automaticamente:
  - `carreiras.renostter.com`
  - `portainer.renostter.com`
  - `status.renostter.com`
- Salva o token no `.env`

⚠️ **Pré-requisito**: o domínio `renostter.com` precisa estar com nameservers na Cloudflare. Se ainda não está:
1. Cloudflare: Add a site → `renostter.com` → plano Free
2. Cloudflare informa 2 nameservers
3. Na Integrator/GoDaddy: DNS → Nameservers → Custom → cola os 2
4. Espera propagar (até 24h)

### Etapa 7 — Testar tudo

Aguarde 1-2 minutos e teste:

```bash
# Health
curl -I https://carreiras.renostter.com/healthz/

# Site
curl -I https://carreiras.renostter.com/trabalhe-conosco/

# Admin
curl -I https://carreiras.renostter.com/admin/login/

# Portainer (painel Docker)
curl -I https://portainer.renostter.com

# Uptime Kuma (monitoramento)
curl -I https://status.renostter.com
```

### Etapa 8 — Importar monitors no Uptime Kuma

1. Acesse `https://status.renostter.com`
2. Crie o admin no primeiro acesso
3. Vá em **Settings → Backup → Restore**
4. Cole o conteúdo de `deploy/uptime-kuma/monitors.json`
5. **Ajuste os IDs de notificação** (Telegram, Discord, e-mail)
6. Salve

### Etapa 9 — Configurar backup automático

```bash
crontab -e
```

Adicione:

```cron
# Backup diário às 3h da manhã
0 3 * * * /opt/renostter/deploy/scripts/backup.sh >> /var/log/renostter-backup.log 2>&1

# Renovação automática de certificados (se algum dia usar Let's Encrypt direto)
0 0 1 * * /usr/bin/certbot renew --quiet
```

### Etapa 10 — Migrar dados do Render (se aplicável)

**Antes**, no painel do Render:
- Postgres → Connections → **External Connections** → Enable
- Copie a "External Database URL" (formato `postgresql://...`)

**Depois, na VPS**:
```bash
# Adiciona ao .env
echo 'RENDER_EXTERNAL_DATABASE_URL=postgresql://user:pass@host/db' >> /opt/renostter/deploy/.env

# Roda a migração
bash /opt/renostter/deploy/scripts/migrate-from-render.sh
```

⚠️ **Não faça isso antes de validar que a stack está OK** (etapas 1-9).

### Etapa 11 — Apontar DNS e desligar Render

1. Em Cloudflare, confirme que `carreiras.renostter.com` aponta para o tunnel
2. Aguarde 24-48h para migração total de cache
3. Desative o serviço no Render (Settings → Suspend)
4. Espere 7 dias como segurança
5. Delete do Render

---

## 🔐 Segurança (FAÇA antes de subir)

### Variáveis secretas

Nunca commite o `.env`. Está no `.gitignore` (adicionar se faltar):

```gitignore
.env
.env.local
.env.production
```

### Cloudflare

- ✅ Ative **Bot Fight Mode** em Cloudflare → Security → Bots
- ✅ Configure **Rate Limiting Rules**:
  - `/candidatar*` → 5 req / 10 min
  - `/admin/login*` → 5 req / 1 min
- ✅ Ative **Browser Integrity Check**

### VPS

- ✅ `sudo ufw status` deve mostrar só 22, 80, 7844
- ✅ `sudo fail2ban-client status sshd` deve estar ativo
- ✅ `sudo unattended-upgrades --dry-run` para simular
- ✅ Painel Integrator com 2FA

### SSL

- ✅ Cloudflare Tunnel termina SSL automaticamente
- ✅ Nginx interno usa HTTP puro (Cloudflare → Nginx)
- ✅ HSTS ativado no Django (`SECURE_HSTS_SECONDS=31536000`)

---

## 🔧 Operações comuns

### Atualizar o site

```bash
cd /opt/renostter
git pull origin main

# Rebuild só a imagem do Django
cd deploy
docker compose build web
docker compose up -d web worker

# Limpar imagem antiga
docker image prune -f
```

### Ver logs

```bash
# Todos os serviços
docker compose -f /opt/renostter/deploy/docker-compose.yml logs -f --tail=100

# Só web
docker compose -f /opt/renostter/deploy/docker-compose.yml logs -f web

# Filtrar por erro
docker compose logs | grep -i error
```

### Acessar o Django shell

```bash
docker compose -f /opt/renostter/deploy/docker-compose.yml exec web python manage.py shell
```

### Rodar migrations manualmente

```bash
docker compose -f /opt/renostter/deploy/docker-compose.yml exec web python manage.py migrate
```

### Criar novo usuário master (se perder senha)

```bash
docker compose -f /opt/renostter/deploy/docker-compose.yml exec web \
    python manage.py create_master_user \
    --username admin@renostter.com.br \
    --email admin@renostter.com.br \
    --password "SuaSenhaForte!"
```

### Escalar (adicionar mais réplicas)

```bash
# Sobe 3 réplicas do web
docker compose -f /opt/renostter/deploy/docker-compose.yml up -d --scale web=3
```

> ⚠️ O docker-compose local **não tem load balancer** entre as réplicas. Para produção séria, use Kubernetes ou Docker Swarm. Para a carga atual, **1 réplica é mais que suficiente**.

### Habilitar ML local (Docling, transformers)

Se quiser triagem de currículos com IA local:

```bash
# 1. Edita o .env
echo "INSTALL_ML=true" >> /opt/renostter/deploy/.env

# 2. Rebuild
cd /opt/renostter/deploy
docker compose build web
docker compose up -d web worker
```

⚠️ A imagem vai crescer ~2-3 GB e o worker pode usar 1-2 GB de RAM por execução.

---

## 🆘 Troubleshooting

### "Conexão recusada" no site

```bash
# 1. Containers estão up?
docker compose -f /opt/renostter/deploy/docker-compose.yml ps

# 2. Health do web?
docker inspect -f '{{.State.Health.Status}}' renostter-web

# 3. Logs do web
docker compose -f /opt/renostter/deploy/docker-compose.yml logs --tail=50 web

# 4. Nginx está healthy?
docker inspect -f '{{.State.Health.Status}}' renostter-nginx
```

### "502 Bad Gateway" do Cloudflare

- Cloudflare → Não consegue alcançar `nginx:80` dentro da VPS
- Causa mais comum: container `nginx` caiu ou `web` não está respondendo na 8000
- Solução: `docker compose restart web nginx`

### "Too many open files"

```bash
# Verificar
ulimit -n

# Aumentar (persistente)
echo "fs.file-max = 65535" | sudo tee -a /etc/sysctl.conf
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf
sudo sysctl -p
```

### Disco cheio

```bash
# Ver uso
df -h

# Limpar logs Docker
docker system prune -a --volumes -f

# Limpar backups antigos (manual)
find /var/backups/renostter -name "*.tar.gz" -mtime +90 -delete
```

### "Connection refused" no Postgres

```bash
docker compose -f /opt/renostter/deploy/docker-compose.yml logs postgres

# Se aparecer "database files are incompatible", apague o volume:
docker compose down
docker volume rm renostter_postgres_data
docker compose up -d
```

⚠️ Isso **apaga o banco**. Só faça se acabou de subir e não tem dados importantes.

### Restore não funciona

Veja `bash deploy/scripts/restore.sh --help` e leia o cabeçalho do script.

---

## 📊 Custos finais

| Item | Custo/mês |
|---|---|
| VPS Integrator ICP Power | R$ 100-200 |
| Cloudflare (Free) | R$ 0 |
| Backblaze B2 (10 GB) | R$ 0 (até 10 GB) |
| Resend (3k e-mails) | R$ 0 (até 3k) |
| Supabase Free (500 MB storage) | R$ 0 |
| Domínio `renostter.com` | R$ 4/mês (já pago anualmente) |
| **Total** | **~R$ 110-220/mês** |

Vs. Railway Pro (R$ 180-300) ou Render Pro (R$ 110-200 com cold start).

---

## 📚 Referências úteis

- [Docker Compose docs](https://docs.docker.com/compose/)
- [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Django deployment checklist](https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/)
- [PostgreSQL tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [Uptime Kuma](https://github.com/louislam/uptime-kuma)
- [Portainer](https://docs.portainer.io/)
