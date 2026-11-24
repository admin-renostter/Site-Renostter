import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { emailParaLeadCrm, receberEmail, textoDoEmail } from '../proxy/email.js';

const bruto = (cabecalhos, corpo) =>
    new TextEncoder().encode(`${cabecalhos.join('\r\n')}\r\nMIME-Version: 1.0\r\n\r\n${corpo}`);

function mensagem(raw, extras = {}) {
    const h = new Map(Object.entries(extras));
    return { raw, from: 'envelope@exemplo.com', headers: { get: (k) => h.get(k.toLowerCase()) || null } };
}

describe('e-mail de orçamento → CRM', () => {
    it('extrai o texto e corta o histórico citado', () => {
        const texto = textoDoEmail({
            text: 'Bom dia,\n\nPreciso limpar 3 splits.\n\nEm seg., 23 de nov. de 2026, Fulano escreveu:\n> mensagem antiga',
        });
        expect(texto).toBe('Bom dia,\n\nPreciso limpar 3 splits.');
        expect(textoDoEmail({ html: '<p>Olá</p><p>Quero <b>PMOC</b> &amp; contrato</p><style>p{}</style>' })).toBe(
            'Olá\n Quero PMOC & contrato',
        );
    });

    it('monta o lead com nome, e-mail, assunto e mensagem', () => {
        const lead = emailParaLeadCrm({
            from: { name: 'Maria Souza', address: 'Maria@Clinica.com.br' },
            subject: '  Orçamento   PMOC ',
            text: 'Temos 12 aparelhos.',
        });
        expect(lead).toEqual({
            nome: 'Maria Souza',
            email: 'maria@clinica.com.br',
            origem: 'email',
            assunto: 'Orçamento PMOC',
            mensagem: 'Temos 12 aparelhos.',
        });
        expect(emailParaLeadCrm({ from: { address: 'joao@x.com' } }).nome).toBe('joao');
    });

    it('ignora resposta automática, aviso de entrega e e-mail sem remetente', () => {
        expect(emailParaLeadCrm({ from: { address: 'a@b.com' } }, { autoSubmitted: 'auto-replied' })).toBeNull();
        expect(emailParaLeadCrm({ from: { address: 'MAILER-DAEMON@zoho.com' } })).toBeNull();
        expect(emailParaLeadCrm({ from: {} })).toBeNull();
        expect(
            emailParaLeadCrm({ from: { address: 'avisos@zoho.com' } }, { autoSubmitted: 'auto-generated' }),
        ).not.toBeNull();
    });

    it('lê o MIME, assina e envia ao CRM', async () => {
        const raw = bruto(
            [
                'From: "Carlos Mendes" <carlos@loja.com>',
                'To: orcamento@renostter.com',
                'Subject: =?UTF-8?Q?Ar_parou_de_gelar?=',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: quoted-printable',
            ],
            'O ar da loja est=C3=A1 pingando. Preciso para hoje.',
        );
        const chamadas = [];
        const r = await receberEmail(
            mensagem(raw),
            {
                CRM_EMAIL_WEBHOOK_URL: 'https://crm.example/in/abc',
                CRM_EMAIL_WEBHOOK_SECRET: 'segredo-de-teste-123456',
            },
            { fetch: async (url, init) => (chamadas.push({ url, init }), { ok: true, status: 200 }) },
        );
        expect(r).toEqual({ resultado: 'enviado' });
        const { url, init } = chamadas[0];
        expect(url).toBe('https://crm.example/in/abc');
        expect(JSON.parse(init.body)).toEqual({
            nome: 'Carlos Mendes',
            email: 'carlos@loja.com',
            origem: 'email',
            assunto: 'Ar parou de gelar',
            mensagem: 'O ar da loja está pingando. Preciso para hoje.',
        });
        expect(init.headers['X-Deskcomm-Signature']).toBe(
            createHmac('sha256', 'segredo-de-teste-123456').update(init.body).digest('hex'),
        );
    });

    it('sem destino, com resposta automática ou com o CRM fora: não recusa o e-mail', async () => {
        const raw = bruto(['From: a@b.com', 'Subject: oi', 'Content-Type: text/plain'], 'x');
        expect(await receberEmail(mensagem(raw), {})).toEqual({ resultado: 'sem_destino' });
        const env = { CRM_EMAIL_WEBHOOK_URL: 'https://crm.example/in/abc' };
        expect(
            await receberEmail(mensagem(raw, { 'auto-submitted': 'auto-replied' }), env, {
                fetch: async () => ({ ok: true }),
            }),
        ).toEqual({
            resultado: 'ignorado',
        });
        expect(await receberEmail(mensagem(raw), env, { fetch: async () => ({ ok: false, status: 500 }) })).toEqual({
            resultado: 'falhou',
            status: 500,
        });
        expect(
            await receberEmail(mensagem(raw), env, {
                fetch: async () => {
                    throw new Error('rede');
                },
            }),
        ).toEqual({ resultado: 'falhou' });
    });
});
