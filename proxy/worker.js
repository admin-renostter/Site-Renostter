/**
 * RENOSTTER — Cloudflare Worker Proxy
 * Protege a chave da Gemini API no servidor
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler secret put GEMINI_API_KEY   ← cole a chave quando pedir
 *   4. wrangler deploy
 *
 * Depois, copie a URL gerada (ex: https://renostter-gemini.SEU_USUARIO.workers.dev)
 * e cole em chatbot.js → CONFIG.PROXY_URL
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/* ─── CORS — permitir apenas o domínio do site ─── */
const ALLOWED_ORIGINS = [
    'https://renostter.com',
    'https://www.renostter.com',
    'http://localhost',           // testes locais (remova em produção)
    'http://127.0.0.1',
    'null',                       // file:// para testes offline
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

/* ─── Rate limiting simples por IP (em memória) ─── */
const rateLimitMap = new Map();   // ip → { count, resetAt }
const RATE_LIMIT_RPM = 20;        // máx. 20 req/minuto por IP

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

        /* Preflight CORS */
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        /* Aceitar apenas POST */
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        /* Rate Limit */
        const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        if (!checkRateLimit(clientIP)) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded. Tente novamente em 1 minuto.' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        /* Validar body */
        let body;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        /* Verificar se a chave está configurada */
        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured in Worker secrets' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        /* Proxiar para Gemini API */
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
            return new Response(JSON.stringify({ error: 'Upstream error', detail: err.message }), {
                status: 502,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }
    },
};
