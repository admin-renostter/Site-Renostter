# Deploy do Painel RH Django

Este guia publica o modulo `django-trabalhe-conosco` separado do site estatico.

## Arquitetura

- `https://www.renostter.com`: site estatico no Netlify.
- `https://carreiras.renostter.com`: Django RH com PostgreSQL.

## Render

1. Suba o repositorio para o GitHub.
2. Acesse o Render.
3. Clique em `New > Blueprint`.
4. Selecione o repositorio `admin-renostter/Site-Renostter`.
5. Confirme o arquivo `render.yaml`.
6. Antes do primeiro deploy, preencha as variaveis secretas:
   - `MASTER_PASSWORD`
   - `EMAIL_HOST`
   - `EMAIL_HOST_USER`
   - `EMAIL_HOST_PASSWORD`
7. Inicie o deploy.

O `render.yaml` cria:

- Web Service Python para Django.
- Banco PostgreSQL.
- `SECRET_KEY` gerada pelo Render.
- Deploy com `collectstatic`.
- Start com `migrate`, criacao/atualizacao do usuario master e `gunicorn`.

## Usuario Master

O usuario master e configurado por variaveis:

```env
MASTER_USERNAME=adminrenostter@gmail.com
MASTER_EMAIL=adminrenostter@gmail.com
MASTER_PASSWORD=senha-forte-definida-no-render
```

Use uma senha forte no Render e depois altere pelo proprio painel RH.

## DNS

No painel onde o dominio `renostter.com` e gerenciado:

1. Crie um registro `CNAME`.
2. Nome: `carreiras`.
3. Valor: dominio gerado pelo Render, por exemplo:

```text
renostter-careers.onrender.com
```

Depois, no Render:

1. Abra o servico `renostter-careers`.
2. Va em `Settings > Custom Domains`.
3. Adicione `carreiras.renostter.com`.
4. Aguarde a emissao do SSL.

## Validacao

Depois do DNS propagar, teste:

```text
https://carreiras.renostter.com/trabalhe-conosco/
https://carreiras.renostter.com/admin/login/
```

No site estatico, o menu `Trabalhe Conosco` deve apontar para:

```text
https://carreiras.renostter.com/trabalhe-conosco/
```

## Observacoes de seguranca

- Nao publique `.env`, `db.sqlite3`, `.venv`, `private_media` ou curriculos.
- Nao deixe `DEBUG=True` em producao.
- Nao hospede o Django no Netlify comum.
- Mantenha `carreiras.renostter.com` com HTTPS ativo.
