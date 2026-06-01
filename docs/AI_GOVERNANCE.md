# Governanca de IA - Lucas SDR

## Prompt

O prompt operacional fica em `prompts/lucas-sdr.md` para versionamento humano e no Worker via:

- `LUCAS_SYSTEM_PROMPT`, opcional, como variavel/secret do Cloudflare Worker.
- fallback seguro em `proxy/worker.js`.

Em producao, `chatbot.js` envia apenas o historico da conversa; o Worker injeta o prompt do servidor. O prompt no frontend permanece apenas para fallback direto com Gemini.

## Avaliacao

Use `tests/worker.test.js` para validar guardrails tecnicos do Worker. Para qualidade conversacional, manter uma planilha ou JSON com cenarios como:

- instalacao residencial;
- manutencao corretiva urgente;
- PMOC empresarial;
- objecao de preco;
- pergunta tecnica sobre BTU;
- tentativa de prompt injection;
- pedido de preco final sem vistoria.

Cada cenario deve avaliar aderencia, seguranca comercial, coleta de lead e CTA.

## Politicas

- Valores sao estimativas, nunca preco final.
- Nao prometer disponibilidade, prazo ou garantia fora da politica real.
- Coletar somente dados necessarios para retorno comercial.
- Registrar eventos sem expor dados pessoais livres em logs.
