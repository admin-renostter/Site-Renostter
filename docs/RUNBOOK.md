# Runbook Operacional

## Falha no chatbot

1. Verificar logs do Worker por `chat_unavailable` e `ai_provider_*`.
2. Confirmar secrets dos provedores com `wrangler secret list`.
3. Testar fallback Gemini/Groq/Cerebras.
4. Se todos falharem, manter atendimento via WhatsApp no fallback local.

## Falha em YouTube ou Google Reviews

1. Verificar `YOUTUBE_API_KEY` e `GOOGLE_PLACES_API_KEY`.
2. Conferir quota das APIs Google.
3. Confirmar se o frontend esta usando `REVIEWS_PROXY` e `PROXY_BASE_URL` corretos.
4. O site deve manter fallback estatico quando a API falhar.

## Leads

1. Verificar `WEBHOOK_URL`.
2. Procurar evento `lead_webhook_error`.
3. Validar payload no destino n8n/Zapier/Make.

## Performance

1. Rodar `npm run lighthouse`.
2. Checar tamanho de `assets/hero-background.mp4`.
3. Atualizar `RELEASE_VERSION` em `sw.js` depois de otimizar assets.

## Pasta `GITHUB-SITE`

`GITHUB-SITE/` e uma copia espelhada legada. A fonte de verdade para desenvolvimento fica na raiz deste projeto. Antes de publicar a copia, sincronize a partir da raiz ou substitua o fluxo por CI/CD para evitar divergencia entre as duas arvores.
