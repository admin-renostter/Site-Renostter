/**
 * RENOSTTER — Cloudflare Worker Proxy
 * Protege as chaves de API no servidor
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler secret put GEMINI_API_KEY         ← cole a chave Gemini quando pedir
 *   4. wrangler secret put YOUTUBE_API_KEY        ← cole a chave YouTube quando pedir
 *   5. wrangler secret put GOOGLE_PLACES_API_KEY  ← cole a chave Google Places quando pedir
 *   6. wrangler deploy
 *
 * Depois, copie a URL gerada (ex: https://renostter-gemini.SEU_USUARIO.workers.dev)
 * e cole em chatbot.js → CONFIG.PROXY_URL
 * e em js/portfolio.js → PROXY_BASE_URL
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const YOUTUBE_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const PLACES_DETAILS_ENDPOINT  = 'https://maps.googleapis.com/maps/api/place/details/json';
const PLACES_FIND_ENDPOINT     = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';

/* Texto de busca canônico para descoberta automática do Place ID */
const RENOSTTER_QUERY = 'Renostter Rua do Pombo Correio 428 São Paulo';

/* ─── CORS — permitir apenas o domínio do site ─── */
const ALLOWED_ORIGINS = [
    'https://renostter.com',
    'https://www.renostter.com',
    'http://localhost',
    'http://127.0.0.1',
    'null',
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

/* ─── Rate limiting simples por IP (em memória) ─── */
const rateLimitMap = new Map();
const RATE_LIMIT_RPM = 20;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60_000 };

    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + 60_000;
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    return entry.count <= RATE_LIMIT_RPM;
}

/* ─── Handler principal ─── */
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const url = new URL(request.url);

        /* Preflight CORS */
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        /* Rate Limit */
        const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        if (!checkRateLimit(clientIP)) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded. Tente novamente em 1 minuto.' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        /* ── Rota YouTube: GET /youtube ── */
        if (request.method === 'GET' && url.pathname === '/youtube') {
            if (!env.YOUTUBE_API_KEY) {
                return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured in Worker secrets' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            const channelId = url.searchParams.get('channelId') || '';
            const maxResults = url.searchParams.get('maxResults') || '9';

            if (!channelId) {
                return new Response(JSON.stringify({ error: 'channelId é obrigatório' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            try {
                const params = new URLSearchParams({
                    key: env.YOUTUBE_API_KEY,
                    channelId,
                    part: 'snippet',
                    order: 'date',
                    maxResults,
                    type: 'video',
                });

                const ytRes = await fetch(`${YOUTUBE_SEARCH_ENDPOINT}?${params}`);
                const data = await ytRes.json();

                return new Response(JSON.stringify(data), {
                    status: ytRes.status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=3600',
                        ...corsHeaders(origin),
                    },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Upstream YouTube error', detail: err.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }
        }

        /* ── Descoberta automática do Place ID: GET /places/find ── */
        if (request.method === 'GET' && url.pathname === '/places/find') {
            if (!env.GOOGLE_PLACES_API_KEY) {
                return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            const query = url.searchParams.get('q') || RENOSTTER_QUERY;

            try {
                const params = new URLSearchParams({
                    key: env.GOOGLE_PLACES_API_KEY,
                    input: query,
                    inputtype: 'textquery',
                    fields: 'place_id,name,rating,user_ratings_total',
                    language: 'pt-BR',
                });

                const findRes = await fetch(`${PLACES_FIND_ENDPOINT}?${params}`);
                const data    = await findRes.json();

                return new Response(JSON.stringify(data), {
                    status: findRes.status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=86400', /* 24h */
                        ...corsHeaders(origin),
                    },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Upstream Places find error', detail: err.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }
        }

        /* ── Rota Google Places (avaliações): GET /places ── */
        if (request.method === 'GET' && url.pathname === '/places') {
            if (!env.GOOGLE_PLACES_API_KEY) {
                return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured in Worker secrets' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            const placeId = url.searchParams.get('place_id') || '';
            if (!placeId) {
                return new Response(JSON.stringify({ error: 'place_id é obrigatório' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            try {
                const params = new URLSearchParams({
                    key: env.GOOGLE_PLACES_API_KEY,
                    place_id: placeId,
                    fields: 'name,rating,user_ratings_total,reviews',
                    language: 'pt-BR',
                });

                const placesRes = await fetch(`${PLACES_DETAILS_ENDPOINT}?${params}`);
                const data = await placesRes.json();

                return new Response(JSON.stringify(data), {
                    status: placesRes.status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=3600',
                        ...corsHeaders(origin),
                    },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Upstream Places error', detail: err.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }
        }

        /* ── Rota Gemini: POST / ── */
        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch {
                return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            if (!env.GEMINI_API_KEY) {
                return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured in Worker secrets' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            try {
                const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                const data = await geminiRes.json();

                return new Response(JSON.stringify(data), {
                    status: geminiRes.status,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: 'Upstream Gemini error', detail: err.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }
        }

        return new Response('Method Not Allowed', { status: 405 });
    },
};
