/**
 * RENOSTTER — Cloudflare Worker Proxy v2.0
 * AI Chatbot com pool multi-provedor e fallback em cascata
 *
 * ─── Secrets a configurar (wrangler secret put <NOME>) ───────────────────
 *   GROQ_API_KEY          Primário (velocidade)  groq.com
 *   CEREBRAS_API_KEY      Primário (contexto)    cerebras.ai
 *   MISTRAL_API_KEY       Secundário             mistral.ai
 *   DEEPSEEK_API_KEY      Secundário             deepseek.com
 *   OPENROUTER_API_KEY    Fallback universal     openrouter.ai
 *   AIMLAPI_API_KEY       Backup                 aimlapi.com
 *   ZAI_API_KEY           Backup                 together.xyz (verificar endpoint)
 *   GEMINI_API_KEY        Legado / fallback      Google Gemini
 *   YOUTUBE_API_KEY       Vídeos YouTube
 *   GOOGLE_PLACES_API_KEY Avaliações Google
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Deploy:
 *   1. wrangler secret put GROQ_API_KEY
 *   2. wrangler secret put CEREBRAS_API_KEY
 *   3. (repita para cada chave acima)
 *   4. wrangler deploy
 */

/* ── Endpoints legados ───────────────────────────────────────────────────── */
const GEMINI_ENDPOINT          = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const YOUTUBE_SEARCH_ENDPOINT  = 'https://www.googleapis.com/youtube/v3/search';
const PLACES_DETAILS_ENDPOINT  = 'https://maps.googleapis.com/maps/api/place/details/json';
const PLACES_FIND_ENDPOINT     = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const RENOSTTER_QUERY          = 'Renostter Rua do Pombo Correio 428 São Paulo';

/* ── CORS ────────────────────────────────────────────────────────────────── */
const ALLOWED_ORIGINS = [
    'https://renostter.com',
    'https://www.renostter.com',
    'http://localhost',
    'http://127.0.0.1',
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

/* ── Rate limiting (por IP, em memória) ─────────────────────────────────── */
const rateLimitMap = new Map();
const DEFAULT_RATE_LIMIT_RPM = 20;

export function getRateLimitRpm(env = {}) {
    const rpm = Number.parseInt(env.RATE_LIMIT_RPM, 10);
    return Number.isFinite(rpm) && rpm > 0 ? rpm : DEFAULT_RATE_LIMIT_RPM;
}

function checkRateLimit(ip, env = {}) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60_000 };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
    entry.count++;
    rateLimitMap.set(ip, entry);
    return entry.count <= getRateLimitRpm(env);
}

function sanitizeString(value, maxLength = 240) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function sanitizeChatPart(part) {
    const text = sanitizeString(part?.text, 4000);
    return text ? { text } : null;
}

export function validateLeadPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: 'Payload de lead invalido.' };
    }

    return {
        ok: true,
        value: {
            nome: sanitizeString(payload.nome),
            servico: sanitizeString(payload.servico),
            tipo: sanitizeString(payload.tipo),
            urgencia: sanitizeString(payload.urgencia),
            origem: sanitizeString(payload.origem) || 'chatbot',
        },
    };
}

export function validateChatPayload(payload, env = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: 'Payload de chat invalido.' };
    }

    if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
        return { ok: false, error: 'Historico do chat ausente.' };
    }

    if (payload.contents.length > 20) {
        return { ok: false, error: 'Historico do chat excede o limite permitido.' };
    }

    const contents = payload.contents
        .map((turn) => {
            const parts = Array.isArray(turn?.parts)
                ? turn.parts.map(sanitizeChatPart).filter(Boolean).slice(0, 8)
                : [];

            return {
                role: turn?.role === 'model' ? 'model' : 'user',
                parts,
            };
        })
        .filter((turn) => turn.parts.length > 0);

    if (!contents.length) {
        return { ok: false, error: 'Mensagem do chat vazia.' };
    }

    const generationConfig = payload.generationConfig || {};
    const promptFromEnv = sanitizeString(env.LUCAS_SYSTEM_PROMPT, 4000);
    const promptFromPayload = sanitizeString(payload.system_instruction?.parts?.[0]?.text, 4000);

    return {
        ok: true,
        value: {
            ...payload,
            contents,
            system_instruction: {
                parts: [{ text: promptFromEnv || promptFromPayload }],
            },
            generationConfig: {
                temperature: clampNumber(generationConfig.temperature, 0.75, 0, 1),
                topP: clampNumber(generationConfig.topP, 0.95, 0, 1),
                maxOutputTokens: Math.round(clampNumber(generationConfig.maxOutputTokens, 1024, 1, 1024)),
            },
        },
    };
}

/* ── Pool de provedores ──────────────────────────────────────────────────── */
/*
 * Ordem de prioridade conforme estratégia definida:
 *   [1] Groq        — primário (velocidade, 14.400 req/dia)
 *   [2] Cerebras    — primário (contexto, 60k tokens/min)
 *   [3] Gemini      — secundário legado (já configurado e testado)
 *   [4] Mistral     — secundário estável
 *   [5] DeepSeek    — secundário (bastião de tokens)
 *   [6] OpenRouter  — fallback universal (:free models)
 *   [7] AIMLAPI     — backup (10 req/h)
 *   [8] Z.ai        — backup (créditos regulares)
 */
function buildProviders(env) {
    const providers = [];

    if (env.GROQ_API_KEY) providers.push({
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: env.GROQ_API_KEY,
        model: 'llama-3.3-70b-versatile',
        format: 'openai',
    });

    if (env.CEREBRAS_API_KEY) providers.push({
        name: 'cerebras',
        url: 'https://api.cerebras.ai/v1/chat/completions',
        key: env.CEREBRAS_API_KEY,
        model: 'llama3.1-8b',
        format: 'openai',
    });

    if (env.GEMINI_API_KEY) providers.push({
        name: 'gemini',
        url: `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
        format: 'gemini',
    });

    if (env.MISTRAL_API_KEY) providers.push({
        name: 'mistral',
        url: 'https://api.mistral.ai/v1/chat/completions',
        key: env.MISTRAL_API_KEY,
        model: 'mistral-small-latest',
        format: 'openai',
    });

    if (env.DEEPSEEK_API_KEY) providers.push({
        name: 'deepseek',
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        format: 'openai',
    });

    if (env.OPENROUTER_API_KEY) providers.push({
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: env.OPENROUTER_API_KEY,
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        format: 'openai',
        extraHeaders: {
            'HTTP-Referer': 'https://renostter.com',
            'X-Title': 'Renostter Chatbot',
        },
    });

    if (env.AIMLAPI_API_KEY) providers.push({
        name: 'aimlapi',
        url: 'https://api.aimlapi.com/v1/chat/completions',
        key: env.AIMLAPI_API_KEY,
        model: 'meta-llama/Llama-3-8b-chat-hf',
        format: 'openai',
    });

    if (env.ZAI_API_KEY) providers.push({
        name: 'zai',
        /* ⚠️  Confirme o endpoint correto para seu plano Z.ai / Together.ai */
        url: 'https://api.together.xyz/v1/chat/completions',
        key: env.ZAI_API_KEY,
        model: 'meta-llama/Llama-3-8b-chat-hf',
        format: 'openai',
    });

    return providers;
}

/* ── Tradução de formato: Gemini → OpenAI ───────────────────────────────── */
function toOpenAIPayload(geminiBody, model) {
    const messages = [];

    const sysText = geminiBody?.system_instruction?.parts?.[0]?.text;
    if (sysText) messages.push({ role: 'system', content: sysText });

    for (const turn of (geminiBody.contents || [])) {
        const role    = turn.role === 'model' ? 'assistant' : 'user';
        const content = (turn.parts || []).map(p => p.text || '').join('');
        messages.push({ role, content });
    }

    return {
        model,
        messages,
        temperature: geminiBody.generationConfig?.temperature ?? 0.75,
        top_p:       geminiBody.generationConfig?.topP        ?? 0.95,
        max_tokens:  geminiBody.generationConfig?.maxOutputTokens ?? 1024,
    };
}

/* ── Tradução de formato: OpenAI → Gemini ───────────────────────────────── */
function wrapAsGemini(text) {
    return {
        candidates: [{
            content: { parts: [{ text }], role: 'model' },
            finishReason: 'STOP',
        }],
    };
}

/* ── Fetch com timeout ───────────────────────────────────────────────────── */
async function fetchWithTimeout(url, options, ms = 8000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

/* ── Fallback em cascata por provedores ─────────────────────────────────── */
async function callAI(geminiBody, env) {
    const providers = buildProviders(env);
    if (providers.length === 0) return null;

    for (const p of providers) {
        try {
            let reqUrl, reqBody, reqHeaders;

            if (p.format === 'gemini') {
                reqUrl     = p.url;
                reqBody    = geminiBody;
                reqHeaders = { 'Content-Type': 'application/json' };
            } else {
                reqUrl     = p.url;
                reqBody    = toOpenAIPayload(geminiBody, p.model);
                reqHeaders = {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${p.key}`,
                    ...(p.extraHeaders || {}),
                };
            }

            const res = await fetchWithTimeout(reqUrl, {
                method: 'POST',
                headers: reqHeaders,
                body: JSON.stringify(reqBody),
            }, 8000);

            /* Sucesso */
            if (res.ok) {
                const data = await res.json();
                if (p.format === 'gemini') return data;
                const text = data?.choices?.[0]?.message?.content || '';
                if (!text) continue; // resposta vazia → tenta próximo
                return wrapAsGemini(text);
            }

            /* 429 / 5xx → tenta próximo provedor */
            if (res.status === 429 || res.status >= 500) {
                console.warn(`[worker] ${p.name} → ${res.status}, tentando próximo`);
                continue;
            }

            /* 4xx não-retriable: loga e tenta mesmo assim (degraded mode) */
            console.error(`[worker] ${p.name} → ${res.status} (não-retriable), tentando próximo`);
        } catch (e) {
            console.warn(`[worker] ${p.name} → ${e.message}, tentando próximo`);
        }
    }

    return null; // todos os provedores falharam
}

/* ══════════════════════════════════════════════════════════════════════════
   HANDLER PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const url    = new URL(request.url);

        /* ── Preflight CORS ── */
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        /* ── Rate limit ── */
        const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        if (!checkRateLimit(clientIP, env)) {
            return new Response(
                JSON.stringify({ error: 'Rate limit exceeded. Tente novamente em 1 minuto.' }),
                { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
            );
        }

        /* ══ POST /lead — Captura de lead do chatbot ══════════════════════ */
        if (request.method === 'POST' && url.pathname === '/lead') {
            let lead;
            try { lead = await request.json(); } catch {
                return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
                    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            const leadValidation = validateLeadPayload(lead);
            if (!leadValidation.ok) {
                return new Response(JSON.stringify({ error: leadValidation.error }), {
                    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            /* Encaminha para webhook externo se configurado (n8n, Zapier, Make, etc.)
               wrangler secret put WEBHOOK_URL */
            if (env.WEBHOOK_URL) {
                try {
                    await fetch(env.WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(leadValidation.value),
                    });
                } catch (e) {
                    console.error('[worker] Webhook lead error:', e.message);
                }
            }

            return new Response(JSON.stringify({ ok: true }), {
                status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        /* ══ GET /youtube ══════════════════════════════════════════════════ */
        if (request.method === 'GET' && url.pathname === '/youtube') {
            if (!env.YOUTUBE_API_KEY) {
                return new Response(
                    JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }),
                    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            const channelId  = url.searchParams.get('channelId') || '';
            const maxResults = url.searchParams.get('maxResults') || '9';

            if (!channelId) {
                return new Response(
                    JSON.stringify({ error: 'channelId é obrigatório' }),
                    { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            try {
                const params  = new URLSearchParams({ key: env.YOUTUBE_API_KEY, channelId, part: 'snippet', order: 'date', maxResults, type: 'video' });
                const ytRes   = await fetch(`${YOUTUBE_SEARCH_ENDPOINT}?${params}`);
                const data    = await ytRes.json();
                return new Response(JSON.stringify(data), {
                    status: ytRes.status,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders(origin) },
                });
            } catch (err) {
                return new Response(
                    JSON.stringify({ error: 'Upstream YouTube error', detail: err.message }),
                    { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }
        }

        /* ══ GET /places/find ═════════════════════════════════════════════ */
        if (request.method === 'GET' && url.pathname === '/places/find') {
            if (!env.GOOGLE_PLACES_API_KEY) {
                return new Response(
                    JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
                    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            const query = url.searchParams.get('q') || RENOSTTER_QUERY;

            try {
                const params   = new URLSearchParams({ key: env.GOOGLE_PLACES_API_KEY, input: query, inputtype: 'textquery', fields: 'place_id,name,rating,user_ratings_total', language: 'pt-BR' });
                const findRes  = await fetch(`${PLACES_FIND_ENDPOINT}?${params}`);
                const data     = await findRes.json();
                return new Response(JSON.stringify(data), {
                    status: findRes.status,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', ...corsHeaders(origin) },
                });
            } catch (err) {
                return new Response(
                    JSON.stringify({ error: 'Upstream Places find error', detail: err.message }),
                    { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }
        }

        /* ══ GET /places ══════════════════════════════════════════════════ */
        if (request.method === 'GET' && url.pathname === '/places') {
            if (!env.GOOGLE_PLACES_API_KEY) {
                return new Response(
                    JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
                    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            const placeId = url.searchParams.get('place_id') || '';
            if (!placeId) {
                return new Response(
                    JSON.stringify({ error: 'place_id é obrigatório' }),
                    { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            try {
                const params    = new URLSearchParams({ key: env.GOOGLE_PLACES_API_KEY, place_id: placeId, fields: 'name,rating,user_ratings_total,reviews', language: 'pt-BR' });
                const placesRes = await fetch(`${PLACES_DETAILS_ENDPOINT}?${params}`);
                const data      = await placesRes.json();
                return new Response(JSON.stringify(data), {
                    status: placesRes.status,
                    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders(origin) },
                });
            } catch (err) {
                return new Response(
                    JSON.stringify({ error: 'Upstream Places error', detail: err.message }),
                    { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }
        }

        /* ══ POST / — AI Chat ═════════════════════════════════════════════ */
        if (request.method === 'POST') {
            let body;
            try {
                body = await request.json();
            } catch {
                return new Response(
                    JSON.stringify({ error: 'Invalid JSON body' }),
                    { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            const chatValidation = validateChatPayload(body, env);
            if (!chatValidation.ok) {
                return new Response(
                    JSON.stringify({ error: chatValidation.error }),
                    { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
                );
            }

            const result = await callAI(chatValidation.value, env);

            if (result) {
                return new Response(JSON.stringify(result), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
                });
            }

            /* Falha catastrófica — todos os provedores esgotados */
            return new Response(
                JSON.stringify({ error: 'Todos os provedores de IA estão temporariamente indisponíveis.' }),
                { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
            );
        }

        return new Response('Method Not Allowed', { status: 405 });
    },
};
