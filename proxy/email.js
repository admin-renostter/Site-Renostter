/**
 * E-mail de orçamento → CRM comercial.
 *
 * O Zoho encaminha o que chega em orcamento@renostter.com para um endereço do
 * Cloudflare Email Routing (subdomínio), que entrega a mensagem a este worker.
 * Cada e-mail vira um card no funil "Orçamentos" do CRM (fonte "E-mail —
 * orçamentos"): quem mandou vira o contato (nome + e-mail), assunto e texto
 * viram campos do negócio. O e-mail original continua na caixa do Zoho.
 *
 *   CRM_EMAIL_WEBHOOK_URL     endereço da fonte "E-mail — orçamentos" no CRM
 *   CRM_EMAIL_WEBHOOK_SECRET  opcional: segredo da mesma fonte (assina o envio)
 */
import PostalMime from 'postal-mime';

const LIMITE_DA_MENSAGEM = 1800;
const REMETENTES_DE_SISTEMA = /^(mailer-daemon|postmaster)@/i;

/** Texto legível do e-mail: o texto puro, ou o HTML sem tags; sem o histórico citado. */
export function textoDoEmail({ text, html } = {}) {
    let corpo = typeof text === 'string' && text.trim() ? text : '';
    if (!corpo && typeof html === 'string') {
        corpo = html
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }
    const linhas = [];
    for (const linha of corpo.replace(/\r\n?/g, '\n').split('\n')) {
        // para no histórico da conversa: "Em ..., fulano escreveu:" / "On ... wrote:" / "-----Original Message-----"
        if (/^\s*(em .+escreveu:|on .+wrote:|-{2,}\s*(original message|mensagem original)\s*-{2,})\s*$/i.test(linha))
            break;
        if (/^\s*>/.test(linha)) continue;
        linhas.push(linha.replace(/[ \t]+/g, ' ').trimEnd());
    }
    const limpo = linhas
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return limpo.length > LIMITE_DA_MENSAGEM ? `${limpo.slice(0, LIMITE_DA_MENSAGEM)}…` : limpo;
}

/**
 * O e-mail já lido (postal-mime) no formato da fonte do CRM, ou `null` quando
 * não deve virar card (resposta automática, aviso de entrega, sem remetente).
 */
export function emailParaLeadCrm(email, { autoSubmitted = '' } = {}) {
    const de = email && email.from ? email.from : {};
    const endereco = String(de.address || '')
        .trim()
        .toLowerCase();
    if (!endereco || !endereco.includes('@')) return null;
    if (REMETENTES_DE_SISTEMA.test(endereco)) return null;
    if (/^auto-replied/i.test(String(autoSubmitted).trim())) return null;

    const nome = String(de.name || '').trim() || endereco.split('@')[0];
    const assunto = String((email && email.subject) || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
    const corpo = {
        nome: nome.slice(0, 200),
        email: endereco,
        origem: 'email',
    };
    if (assunto) corpo.assunto = assunto;
    const mensagem = textoDoEmail(email || {});
    if (mensagem) corpo.mensagem = mensagem;
    return corpo;
}

async function hmacSha256Hex(segredo, texto) {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
    ]);
    const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(texto));
    return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handler `email` do worker. Nunca recusa a mensagem: o original já está no
 * Zoho, e recusar devolveria um aviso de erro para quem escreveu. Falha no CRM
 * fica só no log.
 */
export async function receberEmail(message, env = {}, deps = {}) {
    const enviar = deps.fetch || fetch;
    if (!env.CRM_EMAIL_WEBHOOK_URL) {
        console.warn('[email] CRM_EMAIL_WEBHOOK_URL não configurado; e-mail ignorado');
        return { resultado: 'sem_destino' };
    }
    let lido;
    try {
        lido = await PostalMime.parse(message.raw);
    } catch (e) {
        console.error('[email] não foi possível ler o e-mail:', e.message);
        return { resultado: 'ilegivel' };
    }
    const autoSubmitted = (message.headers && message.headers.get && message.headers.get('auto-submitted')) || '';
    if (!lido.from && message.from) lido.from = { address: message.from };
    const lead = emailParaLeadCrm(lido, { autoSubmitted });
    if (!lead) return { resultado: 'ignorado' };

    const body = JSON.stringify(lead);
    const headers = { 'Content-Type': 'application/json' };
    if (env.CRM_EMAIL_WEBHOOK_SECRET) {
        headers['X-Deskcomm-Signature'] = await hmacSha256Hex(env.CRM_EMAIL_WEBHOOK_SECRET, body);
    }
    try {
        const r = await enviar(env.CRM_EMAIL_WEBHOOK_URL, { method: 'POST', headers, body });
        if (!r.ok) {
            console.error(`[email] CRM respondeu HTTP ${r.status}`);
            return { resultado: 'falhou', status: r.status };
        }
        return { resultado: 'enviado' };
    } catch (e) {
        console.error('[email] erro ao enviar ao CRM:', e.message);
        return { resultado: 'falhou' };
    }
}
