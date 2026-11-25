import { describe, it, expect, vi } from 'vitest';
import { enviarOuEnfileirar, processarFilaCrm, esperaDaTentativa, falhaTemporaria } from '../proxy/fila-crm.js';

const URL_CRM = 'https://crm.exemplo/api/v1/webhooks/in/token-secreto';
const env = (extra = {}) => ({ CRM_WEBHOOK_URL: URL_CRM, CRM_WEBHOOK_SECRET: 's3', ...extra });
const resposta = (status) => Promise.resolve({ ok: status >= 200 && status < 300, status });
const filaFalsa = () => ({ send: vi.fn().mockResolvedValue(undefined) });
const msg = (body, attempts = 1) => ({ body, attempts, ack: vi.fn(), retry: vi.fn() });

describe('fila de reenvio ao CRM', () => {
    it('CRM no ar: envia assinado e não usa a fila', async () => {
        const fila = filaFalsa();
        const enviar = vi.fn(() => resposta(201));
        const r = await enviarOuEnfileirar('crm', '{"nome":"Ana"}', env({ FILA_CRM: fila }), enviar);
        expect(r.resultado).toBe('enviado');
        expect(enviar.mock.calls[0][0]).toBe(URL_CRM);
        expect(enviar.mock.calls[0][1].headers['X-Deskcomm-Signature']).toMatch(/^[0-9a-f]{64}$/);
        expect(fila.send).not.toHaveBeenCalled();
    });

    it('CRM fora (502 ou sem conexão): põe na fila sem o endereço do CRM', async () => {
        for (const falha of [() => resposta(502), () => Promise.reject(new Error('timeout'))]) {
            const fila = filaFalsa();
            const r = await enviarOuEnfileirar('crm', '{"nome":"Ana"}', env({ FILA_CRM: fila }), vi.fn(falha));
            expect(r.resultado).toBe('na_fila');
            const [mensagem, opcoes] = fila.send.mock.calls[0];
            expect(mensagem).toEqual({ tipo: 'crm', body: '{"nome":"Ana"}' });
            expect(JSON.stringify(mensagem)).not.toContain('token-secreto');
            expect(opcoes.delaySeconds).toBe(60);
        }
    });

    it('pedido recusado pelo CRM (400) não vai para a fila', async () => {
        const fila = filaFalsa();
        const r = await enviarOuEnfileirar('crm', '{}', env({ FILA_CRM: fila }), vi.fn(() => resposta(400)));
        expect(r).toEqual({ resultado: 'falhou', status: 400 });
        expect(fila.send).not.toHaveBeenCalled();
    });

    it('sem fila configurada, continua como antes (falhou)', async () => {
        const r = await enviarOuEnfileirar('crm', '{}', env(), vi.fn(() => resposta(503)));
        expect(r).toEqual({ resultado: 'falhou', status: 503 });
    });

    it('consumidor: entrega, tenta de novo se o CRM segue fora, descarta se recusado', async () => {
        const ok = msg({ tipo: 'crm', body: '{"nome":"A"}' });
        const fora = msg({ tipo: 'crm', body: '{"nome":"B"}' }, 3);
        const recusado = msg({ tipo: 'crm', body: '{"nome":"C"}' });
        const respostas = [201, 503, 422];
        await processarFilaCrm({ messages: [ok, fora, recusado] }, env(), vi.fn(() => resposta(respostas.shift())));
        expect(ok.ack).toHaveBeenCalled();
        expect(fora.retry).toHaveBeenCalledWith({ delaySeconds: 480 });
        expect(fora.ack).not.toHaveBeenCalled();
        expect(recusado.ack).toHaveBeenCalled();
    });

    it('espera cresce e para em 15 min; só falhas temporárias repetem', () => {
        expect([1, 2, 3, 5, 10].map(esperaDaTentativa)).toEqual([60, 120, 240, 900, 900]);
        expect([0, 408, 429, 500, 502, 503].every(falhaTemporaria)).toBe(true);
        expect([400, 401, 404, 422].some(falhaTemporaria)).toBe(false);
    });
});
