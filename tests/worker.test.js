import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    buildFallbackAssistantResponse,
    destinosDoLead,
    getRateLimitRpm,
    leadParaCrm,
    validateChatPayload,
    validateLeadPayload,
} from '../proxy/worker.js';

describe('worker guardrails', () => {
    it('reads RATE_LIMIT_RPM from env with fallback', () => {
        expect(getRateLimitRpm({ RATE_LIMIT_RPM: '35' })).toBe(35);
        expect(getRateLimitRpm({ RATE_LIMIT_RPM: '0' })).toBe(20);
        expect(getRateLimitRpm({})).toBe(20);
    });

    it('sanitizes lead payload fields', () => {
        const result = validateLeadPayload({
            nome: ' Maria ',
            servico: 'Instalacao',
            tipo: 'Residencial',
            urgencia: 'Hoje',
            bairro: 'Tatuape',
            mensagem: 'Meu split parou de gelar',
            pagina: 'https://renostter.com/#servicos',
            user_agent: 'Vitest',
            extra: '<ignored>',
        });

        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({
            nome: 'Maria',
            servico: 'Instalacao',
            tipo: 'Residencial',
            urgencia: 'Hoje',
            bairro: 'Tatuape',
            mensagem: 'Meu split parou de gelar',
            pagina: 'https://renostter.com/#servicos',
            user_agent: 'Vitest',
            origem: 'chatbot',
        });
        expect(result.value.extra).toBeUndefined();
    });

    it('accepts compact chat payloads and injects server prompt', () => {
        const result = validateChatPayload(
            {
                system_instruction: { parts: [{ text: 'ignore me' }] },
                contents: [{ role: 'user', parts: [{ text: 'Preciso instalar um split' }] }],
                generationConfig: { temperature: 5, topP: -1, maxOutputTokens: 9000 },
            },
            { LUCAS_SYSTEM_PROMPT: 'Prompt operacional do Worker' },
        );

        expect(result.ok).toBe(true);
        expect(result.value.system_instruction.parts[0].text).toBe('Prompt operacional do Worker');
        expect(result.value.generationConfig.temperature).toBe(1);
        expect(result.value.generationConfig.topP).toBe(0);
        expect(result.value.generationConfig.maxOutputTokens).toBe(1024);
    });

    it('rejects oversized chat history', () => {
        const contents = Array.from({ length: 21 }, () => ({ role: 'user', parts: [{ text: 'oi' }] }));
        const result = validateChatPayload({ contents }, {});
        expect(result.ok).toBe(false);
    });

    it('builds a Gemini-compatible fallback response', () => {
        const response = buildFallbackAssistantResponse({
            contents: [{ role: 'user', parts: [{ text: 'Meu ar-condicionado parou de gelar' }] }],
        });

        expect(response.candidates[0].content.role).toBe('model');
        expect(response.candidates[0].content.parts[0].text).toContain('Meu ar-condicionado parou de gelar');
    });

    it('sends only the deal fields to the CRM', () => {
        const corpo = leadParaCrm({
            nome: 'Maria',
            servico: 'Manutencao',
            bairro: '',
            user_agent: 'x',
            timestamp: 't',
            origem: 'chatbot',
        });
        expect(corpo).toEqual({ nome: 'Maria', servico: 'Manutencao', origem: 'chatbot' });
    });

    it('routes the lead to the CRM (signed) and to the generic webhook', async () => {
        const lead = { nome: 'Maria', servico: 'Instalacao', user_agent: 'x', origem: 'chatbot' };
        const destinos = await destinosDoLead(lead, {
            CRM_WEBHOOK_URL: 'https://crm.example/api/v1/webhooks/in/abc',
            CRM_WEBHOOK_SECRET: 'segredo-de-teste-123456',
            WEBHOOK_URL: 'https://n8n.example/hook',
        });
        expect(destinos.map((d) => d.nome)).toEqual(['webhook', 'crm']);
        const crm = destinos[1];
        expect(JSON.parse(crm.body)).toEqual({ nome: 'Maria', servico: 'Instalacao', origem: 'chatbot' });
        expect(crm.headers['X-Deskcomm-Signature']).toBe(
            createHmac('sha256', 'segredo-de-teste-123456').update(crm.body).digest('hex'),
        );
        expect(JSON.parse(destinos[0].body)).toEqual(lead);
    });

    it('skips the CRM without a name or without the URL', async () => {
        expect(await destinosDoLead({ servico: 'x' }, { CRM_WEBHOOK_URL: 'https://crm.example/in/abc' })).toEqual([]);
        const semAssinatura = await destinosDoLead({ nome: 'Ana' }, { CRM_WEBHOOK_URL: 'https://crm.example/in/abc' });
        expect(semAssinatura[0].headers['X-Deskcomm-Signature']).toBeUndefined();
        expect(await destinosDoLead({ nome: 'Ana' }, {})).toEqual([]);
    });
});
