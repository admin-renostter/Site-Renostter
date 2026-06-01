# Trabalhe Conosco - Django + QA

Este arquivo substitui o escopo PHP anterior por uma construcao Django. O nome foi mantido para preservar o historico do projeto, mas a implementacao recomendada agora fica em `django-trabalhe-conosco/`.

## Analise da Ultima Solicitacao

A solicitacao anterior pedia tres blocos: lista publica de vagas, candidatura publica e painel restrito do recrutador. A nova direcao troca PHP/MySQL por uma base Python orientada a qualidade, automacao e melhor performance operacional.

Ferramentas aplicadas:

- `django`: framework principal, rotas, templates, ORM, auth, CSRF e admin.
- `django-q2`: fila assincorna para processar candidatura sem travar o envio do formulario.
- `docling`: extracao de texto do curriculo para analise posterior.
- `python-decouple`: configuracao via `.env`, sem credenciais no codigo.
- `lancedb`: indice vetorial local para busca/triagem futura de curriculos.
- `sqlalchemy`: trilha de auditoria desacoplada do ORM principal.
- `tzlocal`: fuso horario local automatico, com override por `.env`.
- `agno`: camada opcional para avaliacao assistida por IA quando `AGNO_ENABLED=True`.

## Estrutura Criada

```text
django-trabalhe-conosco/
  manage.py
  requirements.txt
  .env.example
  renostter_careers/
    settings.py
    urls.py
    wsgi.py
  careers/
    admin.py
    apps.py
    forms.py
    models.py
    tasks.py
    urls.py
    views.py
    migrations/
      0001_initial.py
    management/commands/
      seed_careers.py
    services/
      audit.py
      resume_index.py
      resume_parser.py
      screening.py
  templates/careers/
    base.html
    job_list.html
    apply.html
    admin_login.html
    admin/
      job_list.html
      job_form.html
      job_confirm_delete.html
    emails/
      candidate_confirmation.html
      rh_notification.html
  static/careers/
    careers.css
```

## URLs

- `/trabalhe-conosco/`: lista publica de vagas aprovadas/publicadas, com busca, filtros e paginacao.
- `/candidatar/?vaga=ID`: detalhes da vaga e formulario de candidatura.
- `/admin/login/`: login do recrutador.
- `/admin/logout/`: logout.
- `/admin/vagas/`: painel restrito com vagas cadastradas.
- `/admin/vagas/nova/`: criacao de vaga.
- `/admin/vagas/<id>/editar/`: edicao de vaga.
- `/admin/vagas/<id>/excluir/`: exclusao segura ou marcacao como preenchida quando houver candidaturas.
- `/admin/vagas/<id>/duplicar/`: duplicacao via POST com CSRF.
- `/django-admin/`: admin nativo do Django.

## Fluxo Implementado

1. O candidato acessa `/trabalhe-conosco/`.
2. A lista mostra apenas vagas publicadas, aprovadas pelo master e nao expiradas.
3. O candidato entra em `/candidatar/?vaga=ID`.
4. O formulario valida nome, e-mail e curriculo PDF/DOC/DOCX ate 5 MB.
5. A candidatura e salva.
6. `django-q2` recebe a tarefa `careers.tasks.process_application`.
7. A fila extrai texto com `docling`, calcula score de QA, indexa em `lancedb`, grava auditoria via `sqlalchemy` e envia e-mails.
8. O RH recebe e-mail com dados e curriculo anexado.
9. O candidato recebe confirmacao.

## Governanca do Painel RH

O painel trabalha com usuario master e usuarios de area.

Perfis:

- `master`: acesso total, cria usuarios, aprova e publica vagas.
- `gestor_area`: cria e acompanha vagas da propria area.
- `recrutador_area`: cria rascunhos e envia para aprovacao.
- `visualizador`: consulta informacoes da propria area.

Fluxo de publicacao:

```text
Usuario de area cria vaga
-> vaga nasce como rascunho
-> usuario envia para aprovacao
-> master aprova, rejeita ou solicita ajustes
-> somente vaga aprovada vira publicada
-> somente vaga publicada aparece em /trabalhe-conosco/
```

Criar master inicial:

```bash
python manage.py create_master_user \
  --username master_rh \
  --email master@renostter.com.br \
  --password "senha-forte-com-12-ou-mais-caracteres"
```

No painel, o master acessa:

- `/admin/usuarios/`: criar usuarios por area.
- `/admin/aprovacoes/`: aprovar, rejeitar ou solicitar ajustes nas vagas.
- `/admin/vagas/`: consultar todo o funil de vagas.

## Modelagem

### Job

Campos principais:

- `title`
- `description`
- `requirements`
- `benefits`
- `location`
- `modality`: Presencial, Remoto, Hibrido
- `contract_type`: CLT, PJ, Estagio, Freelancer
- `area`
- `status`: rascunho, em_aprovacao, ajustes_solicitados, publicada, pausada, preenchida, rejeitada, arquivada
- `approval_status`: rascunho, pendente, ajustes, aprovada, rejeitada
- `created_by`
- `area_owner`
- `approved_by`
- `approved_at`
- `published_at`
- `rejection_reason`
- `internal_notes`
- `expires_at`
- `created_at`
- `updated_at`

Indices:

- `status + expires_at`
- `area + contract_type + modality`

### Application

Campos principais:

- `job`
- `name`
- `email`
- `phone`
- `message`
- `resume`
- `resume_text`
- `qa_score`
- `created_at`

Indices:

- `job + created_at`
- `email + created_at`

## Instalacao Local

```bash
cd django-trabalhe-conosco
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_careers
python manage.py qcluster
```

Em outro terminal:

```bash
cd django-trabalhe-conosco
.venv\Scripts\activate
python manage.py runserver 8000
```

Acesse:

- `http://127.0.0.1:8000/trabalhe-conosco/`
- `http://127.0.0.1:8000/admin/vagas/`

## Variaveis de Ambiente

Use `.env.example` como base.

Obrigatorias em producao:

```env
SECRET_KEY=...
DEBUG=False
ALLOWED_HOSTS=renostter.com,www.renostter.com
CSRF_TRUSTED_ORIGINS=https://renostter.com,https://www.renostter.com
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
EMAIL_HOST=...
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=Renostter RH <rh@renostter.com.br>
RH_EMAIL=rh@renostter.com.br
```

## QA e Performance

Decisoes aplicadas:

- Filtro publico usa query restrita a vagas abertas e nao expiradas.
- Listagem publica carrega somente campos necessarios com `.only(...)`.
- Painel agrega candidaturas por vaga com `Count`.
- Processamento pesado roda na fila, nao no request.
- Upload limitado a 5 MB e tipos permitidos.
- CSRF ativo em candidatura e painel.
- Login obrigatorio para CRUD.
- Duplicacao de vaga exige POST.
- Cookies seguros em producao.
- Auditoria desacoplada via SQLAlchemy.
- LanceDB preparado para busca sem depender de servico pago.

## Checklist de Testes

- Abrir `/trabalhe-conosco/` e confirmar que so vagas abertas aparecem.
- Testar busca por palavra-chave.
- Testar filtros de area, modalidade e contrato.
- Abrir `/candidatar/?vaga=ID`.
- Enviar sem curriculo e confirmar erro.
- Enviar curriculo acima de 5 MB e confirmar bloqueio.
- Enviar PDF valido e confirmar criacao da candidatura.
- Rodar `python manage.py qcluster` e validar e-mails.
- Confirmar que o RH recebe o curriculo anexado.
- Confirmar que o candidato recebe e-mail de confirmacao.
- Acessar `/admin/vagas/` sem login e confirmar redirecionamento.
- Criar, editar, duplicar e excluir vaga no painel.
- Pausar vaga e confirmar que ela some da lista publica.
- Expirar vaga por data e confirmar que ela some da lista publica.

## Deploy

O guia operacional completo esta em `docs/DEPLOY_TRABALHE_CONOSCO_DJANGO.md`.

Para deploy, a area Django pode rodar no mesmo dominio com reverse proxy:

```nginx
location /trabalhe-conosco/ { proxy_pass http://127.0.0.1:8000; }
location /candidatar/ { proxy_pass http://127.0.0.1:8000; }
location /admin/ { proxy_pass http://127.0.0.1:8000; }
location /static/ { alias /caminho/django-trabalhe-conosco/staticfiles/; }
location /media/ { alias /caminho/django-trabalhe-conosco/media/; }
```

Antes de publicar:

```bash
python manage.py check --deploy
python manage.py collectstatic
python manage.py migrate
```

## Observacao Sobre o Site Atual

O site estatico principal permanece preservado. O link do menu para `/trabalhe-conosco/` pode apontar para esta aplicacao Django via proxy, sem recolocar modal ou formulario no final do layout.
