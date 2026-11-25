/**
 * Fila de reenvio ao CRM (Cloudflare Queues, binding FILA_CRM).
 *
 * Quando o CRM está fora (atualização, reinício, 502), o pedido do site ou do
 * e-mail não se perde: vai para a fila e é reenviado sozinho, com espera
 * crescente (1 min, 2, 4, 8, até 15 min entre tentativas).
 *
 * A mensagem guarda só o tipo e o corpo JSON do pedido. O endereço do CRM é
 * credencial e nunca entra na fila: o consumidor lê de novo dos secrets e
 * assina outra vez.
 */

export const DESTINOS_CRM = {
    crm: { url: 'CRM_WEBHOOK_URL', segredo: 'CRM_WEBHOOK_SECRET' },
    'crm-email': { url: 'CRM_EMAIL_WEBHOOK_URL', segredo: 'CRM_EMAIL_WEBHOOK_SECRET' },
};

const ESPERA_MAXIMA_S = 900;

async function hmacSha256Hex(segredo, texto) {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(texto));
    return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vale tentar de novo? Rede fora, 5xx, 408 e 429 sim; outros 4xx não (o pedido em si está errado). */
export function falhaTemporaria(status) {
    return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Espera antes da próxima tentativa: 60 s dobrando, no máximo 15 min. */
export function esperaDaTentativa(tentativa) {
    const n = Math.max(1, Number(tentativa) || 1);
    return Math.min(60 * 2 ** (n - 1), ESPERA_MAXIMA_S);
}

/** Envia um corpo ao CRM. Devolve { ok, status } (status 0 = erro de rede). */
export async function enviarAoCrm(tipo, body, env = {}, enviar = fetch) {
    const destino = DESTINOS_CRM[tipo];
    const url = destino && env[destino.url];
    if (!url) return { ok: false, status: -1, semDestino: true };
    const headers = { 'Content-Type': 'application/json' };
    const segredo = env[destino.segredo];
    if (segredo) headers['X-Deskcomm-Signature'] = await hmacSha256Hex(segredo, body);
    try {
        const r = await enviar(url, { method: 'POST', headers, body });
        return { ok: r.ok, status: r.status };
    } catch (e) {
        console.error(`[fila-crm] ${tipo}: erro de rede:`, e.message);
        return { ok: false, status: 0 };
    }
}

/**
 * Tenta enviar agora; se o CRM estiver fora, põe na fila.
 * Resultado: 'enviado' | 'na_fila' | 'falhou' | 'sem_destino'.
 */
export async function enviarOuEnfileirar(tipo, body, env = {}, enviar = fetch) {
    const r = await enviarAoCrm(tipo, body, env, enviar);
    if (r.ok) return { resultado: 'enviado', status: r.status };
    if (r.semDestino) return { resultado: 'sem_destino' };
    if (falhaTemporaria(r.status) && env.FILA_CRM && typeof env.FILA_CRM.send === 'function') {
        try {
            await env.FILA_CRM.send({ tipo, body }, { delaySeconds: esperaDaTentativa(1) });
            console.warn(`[fila-crm] ${tipo}: CRM respondeu ${r.status || 'sem conexão'}; pedido na fila`);
            return { resultado: 'na_fila', status: r.status };
        } catch (e) {
            console.error(`[fila-crm] ${tipo}: não consegui pôr na fila:`, e.message);
        }
    }
    console.error(`[fila-crm] ${tipo}: CRM respondeu HTTP ${r.status}`);
    return { resultado: 'falhou', status: r.status };
}

/** Consumidor da fila: reenvia; se o CRM ainda estiver fora, tenta de novo mais tarde. */
export async function processarFilaCrm(batch, env = {}, enviar = fetch) {
    for (const msg of batch.messages) {
        const { tipo, body } = msg.body || {};
        if (!DESTINOS_CRM[tipo] || typeof body !== 'string') {
            console.error('[fila-crm] mensagem inválida descartada');
            msg.ack();
            continue;
        }
        const r = await enviarAoCrm(tipo, body, env, enviar);
        if (r.ok) {
            console.log(`[fila-crm] ${tipo}: entregue na tentativa ${msg.attempts + 1}`);
            msg.ack();
        } else if (falhaTemporaria(r.status)) {
            msg.retry({ delaySeconds: esperaDaTentativa(msg.attempts + 1) });
        } else {
            console.error(`[fila-crm] ${tipo}: CRM recusou (HTTP ${r.status}); descartado`);
            msg.ack();
        }
    }
}
