import { describe, expect, it } from 'vitest';
import { getRateLimitRpm, validateChatPayload, validateLeadPayload } from '../proxy/worker.js';

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
});
