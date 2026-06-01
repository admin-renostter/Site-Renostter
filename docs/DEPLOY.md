# Deploy

## Requisitos

- Node.js 24+
- npm
- Conta Cloudflare com Workers

## Instalar

```bash
npm ci
```

## Validar

```bash
npm run format:check
npm run lint
npm test
npm run test:e2e
```

## Worker

Configure secrets no Cloudflare:

```bash
npx wrangler secret put GROQ_API_KEY --config proxy/wrangler.toml
npx wrangler secret put CEREBRAS_API_KEY --config proxy/wrangler.toml
npx wrangler secret put GEMINI_API_KEY --config proxy/wrangler.toml
npx wrangler secret put YOUTUBE_API_KEY --config proxy/wrangler.toml
npx wrangler secret put GOOGLE_PLACES_API_KEY --config proxy/wrangler.toml
npx wrangler secret put WEBHOOK_URL --config proxy/wrangler.toml
```

Deploy:

```bash
npm run deploy:worker
```

## Ambientes

- `dev`: `npm run dev` e `npx wrangler dev --config proxy/wrangler.toml`
- `staging`: dominio temporario para validar Worker, Lighthouse e smoke test
- `prod`: `https://renostter.com`

## Cache

Ao publicar alteracoes em CSS/JS/HTML, atualize `RELEASE_VERSION` em `sw.js`. O service worker apaga caches antigos no evento `activate`.
