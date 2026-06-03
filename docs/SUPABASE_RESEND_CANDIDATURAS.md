# Curriculos com Supabase Storage e Resend

Esta estrutura mantém o Django no Render, mas salva os curriculos em um bucket privado do Supabase e envia notificacoes pelo Resend.

## Supabase

1. Crie ou abra um projeto no Supabase.
2. Vá em `Storage`.
3. Crie um bucket chamado:

```text
curriculos
```

4. Deixe o bucket como privado.
5. Vá em `Project Settings > API`.
6. Copie:

```text
Project URL
service_role key
```

Use a `service_role key` somente no Render. Nunca coloque essa chave no frontend.

## Resend

1. Crie conta no Resend.
2. Valide um domínio ou use um remetente permitido pela conta.
3. Crie uma API key.
4. Configure o remetente em `DEFAULT_FROM_EMAIL`.

Exemplo:

```text
DEFAULT_FROM_EMAIL=Renostter RH <rh@renostter.com.br>
```

O e-mail ou domínio precisa estar autorizado no Resend.

## Variáveis no Render

No serviço `renostter-careers`, vá em `Environment` e configure:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SUPABASE_STORAGE_BUCKET=curriculos
SUPABASE_SIGNED_URL_TTL_SECONDS=3600
RH_EMAIL=recursoshumanosrenostter@gmail.com
DEFAULT_FROM_EMAIL=Renostter RH <rh@renostter.com.br>
```

Depois faça:

```text
Manual Deploy > Deploy latest commit
```

## Como o RH acessa os curriculos

1. Acesse:

```text
https://carreiras.renostter.com/admin/login/
```

2. Entre com usuário autorizado.
3. Clique em:

```text
Candidaturas
```

4. Na candidatura desejada, clique:

```text
Baixar curriculo
```

O sistema gera um link assinado temporário do Supabase. O arquivo continua privado.

## Fluxo

```text
Candidato envia candidatura
Django salva a candidatura
Django envia o curriculo ao Supabase Storage privado
Django envia e-mail via Resend para candidato e RH
Painel RH lista as candidaturas
Botao Baixar curriculo gera link assinado temporario
```

## Segurança

- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Mantenha o bucket privado.
- Use links assinados com expiração curta.
- Remova currículos antigos conforme política LGPD.

## Monitoramento de storage e limpeza aos 95%

O projeto possui o comando:

```bash
python manage.py monitor_storage_usage
```

Ele mede:

- uso local do Render em `PRIVATE_MEDIA_ROOT`;
- uso do bucket privado do Supabase, somando os arquivos listados pela API de Storage.

Configure no Render:

```env
SUPABASE_STORAGE_LIMIT_BYTES=1073741824
RENDER_STORAGE_LIMIT_BYTES=1073741824
STORAGE_CLEANUP_THRESHOLD_PERCENT=95
```

Use o valor real do seu plano em bytes. Quando `RENDER_STORAGE_LIMIT_BYTES` nao estiver configurado, o Django tenta usar o tamanho reportado pelo sistema de arquivos. Para Supabase, configure o limite manualmente porque a API de Storage usada pela aplicacao nao expoe a cota total do projeto de forma confiavel.

Simulacao segura:

```bash
python manage.py monitor_storage_usage --cleanup --dry-run
```

Execucao real:

```bash
python manage.py monitor_storage_usage --cleanup
```

Importante: a limpeza automatica chama `purge_expired_applications`, ou seja, remove apenas candidaturas vencidas pela politica LGPD. O sistema nao apaga curriculos ainda dentro do prazo de retencao apenas para liberar espaco. Se mesmo apos a limpeza o uso continuar acima de 95%, revise manualmente, aumente o plano ou reduza a politica operacional de retencao com apoio juridico.
