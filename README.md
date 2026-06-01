# Site Renostter

Site estatico da Renostter Climatizacao com landing page, PWA, chatbot Lucas IA, portfolio de videos, Google Reviews, mapa de cobertura, Calendly, WhatsApp e Worker Cloudflare como proxy seguro para APIs externas.

## Estrutura

- `index.html`: pagina principal.
- `styles.css` e `chatbot.css`: estilos globais e widget do chat.
- `script.js`, `calendar.js`, `chatbot.js`: interacoes principais.
- `js/portfolio.js`, `js/reviews.js`, `js/carousel.js`: modulos de conteudo dinamico.
- `proxy/worker.js`: Cloudflare Worker para IA, YouTube, Places e leads.
- `config/site.json`: configuracao operacional central.
- `prompts/lucas-sdr.md`: prompt versionado do Lucas.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Abra `http://localhost:4173`.

## Qualidade

```bash
npm run format:check
npm run lint
npm test
npm run test:e2e
```

## Deploy

Veja `docs/DEPLOY.md`.

## Observabilidade

O Worker emite logs JSON para eventos de IA, leads, rate limit e indisponibilidade. Use `X-Request-Id` para correlacionar requisicoes.
