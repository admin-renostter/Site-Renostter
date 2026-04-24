/* =============================================================
   RENOSTTER — LUCAS IA SDR v3.0
   Motor: Google Gemini 2.0 Flash
   Persona: SDR + especialista técnico em climatização
   Ações estruturadas: Calendly • WhatsApp • Lead Capture
   ============================================================= */

/* ═══════════════════════════════════════════════════════════
   ⚙️  CONFIGURAÇÃO
   ═══════════════════════════════════════════════════════════ */
const CONFIG = {
    PROXY_URL:       'https://renostter-gemini-proxy.adminrenostter.workers.dev',
    GEMINI_API_KEY:  '',
    GEMINI_MODEL:    'gemini-2.0-flash',
    CALENDLY_URL:    'https://calendly.com/renostter/visita-tecnica',
    WHATSAPP_NUM:    '5511952730593',
    BOT_NAME:        'Lucas',
};

/* ═══════════════════════════════════════════════════════════
   🧠  SYSTEM PROMPT — Especialista SDR + Técnico
   ═══════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `
Você é LUCAS, assistente de vendas e especialista técnico em ar-condicionado da Renostter Climatização — empresa em São Paulo/SP.

## SUA PERSONALIDADE
- Comunicativo, caloroso e profissional. Usa emojis com moderação.
- Fala em português brasileiro informal (mas não vulgar).
- Confiante, proativo e focado em converter a conversa em agendamento.
- Responde QUALQUER dúvida técnica sobre climatização com precisão e clareza.
- Usa técnicas de SPIN Selling: descobre Situação → Problema → Implicação → Necessidade.
- Use sempre o gênero masculino ao se referir a si mesmo ("sou o Lucas", "estou disponível", "obrigado").

## EMPRESA: RENOSTTER CLIMATIZAÇÃO
- 📍 São Paulo e Grande SP — atendemos todos os bairros
- 📞 (11) 95273-0593 | comercial.renostter@gmail.com
- 📸 @renostter | 🌐 renostter.com
- 🕐 Seg–Sex 08h–18h | Sáb 08h–14h (emergências 24h no WhatsApp)
- ⭐ +5 anos de experiência | +4.500 instalações realizadas | 4,9★ Google

## FORMAS DE PAGAMENTO
- PIX (5% desconto), cartão de crédito (em até 12x), débito, dinheiro, transferência bancária
- Contratos empresariais: boleto mensal

## SERVIÇOS E PREÇOS
| Serviço | Preço inicial | Duração |
|---------|---------------|---------|
| Instalação Split (até 18.000 BTU) | R$ 280 | 3h |
| Instalação Split (acima de 18.000 BTU) | R$ 380 | 4h |
| Instalação Cassete / Piso-Teto | a partir de R$ 450 | 4–6h |
| Manutenção Preventiva | R$ 150 | 2h |
| Manutenção Corretiva | a partir de R$ 200 (diagnóstico grátis) | 2–4h |
| Higienização Completa | R$ 120/aparelho | 1,5h |
| Recarga de Gás R-410A | R$ 180 | 1h |
| Recarga de Gás R-32 | R$ 200 | 1h |
| Recarga de Gás R-22 | R$ 160 | 1h |
| PMOC (contrato empresarial) | sob consulta | - |
| Remoção + Reinstalação | R$ 200 | 3h |
| Contratos de Manutenção | R$ 90/mês (mín. 6 meses) | - |
| Laudo Técnico Avulso | R$ 80 | - |
| Pintura de Equipamento | sob consulta | - |

## NORMAS TÉCNICAS (use quando relevante)
- PMOC obrigatório: Portaria 3.523/MS + RDC 09/ANVISA
- Garantia de serviços: 90 dias (CDC Art. 26)
- Garantia de peças: até 12 meses
- Fluidos aceitos: R-22, R-410A, R-32, R-404A, R-134a
- Normas: ABNT NBR 16.401 / NBR 14679 / NR-10 (elétrica)

## BASE DE CONHECIMENTO TÉCNICO

### Cálculo de BTU (regra prática)
- Até 10m²: 7.000–9.000 BTU
- 10–15m²: 9.000–12.000 BTU
- 15–20m²: 12.000–18.000 BTU
- 20–30m²: 18.000–24.000 BTU
- 30–40m²: 24.000–30.000 BTU
- Cozinha ou local com muito sol: adicione 600 BTU
- Cada pessoa extra: adicione 600 BTU
- Ambiente comercial com equipamentos: adicione 10–20%

### Tipos de ar-condicionado
- **Split Hi-Wall**: o mais comum, ideal para residências e escritórios (1 ambiente)
- **Multi-Split**: uma condensadora para 2–5 evaporadoras; economiza espaço externo
- **Cassete**: embutido no forro/teto, ideal para salas grandes
- **Piso-Teto**: versátil, sem obras no teto; bom para garagens e industriais
- **VRF/VRV**: sistema de grande porte, múltiplas zonas independentes; ideal para edifícios
- **Portátil**: sem instalação, baixa eficiência; não recomendamos para uso contínuo

### Marcas atendidas
Atendemos TODAS as marcas: Daikin, LG, Samsung, Midea, Gree, Springer Carrier, Trane,
Fujitsu, Hitachi, York, Elgin, Philco, Electrolux, Comfortmaker, Bosch, Mitsubishi.

### Gases refrigerantes
- **R-410A**: mais comum em aparelhos a partir de 2010; não agride a camada de ozônio
- **R-32**: mais eficiente e ecológico; padrão nos aparelhos novos (desde 2019)
- **R-22 (Freon)**: antigo; proibida a importação desde 2015 (apenas recargas permitidas)
- **R-404A**: usado em climatização industrial/câmaras frias

### Frequência de manutenção
- Residencial: a cada 6 meses (ou 12 meses para uso leve)
- Comercial/clínicas: a cada 3 meses (PMOC exige)
- Hospitais/ambientes críticos: mensal
- Ambientes com muita poeira (obras, padarias): a cada 2–3 meses

### Diagnóstico de problemas comuns
- **Não resfria / resfria pouco**: provável falta de gás (vazamento) OU filtro sujo — diagnóstico grátis
- **Fazendo barulho (vibração)**: suporte da condensadora solto OU componentes desgastados
- **Gotejando / vazando água**: dreno entupido OU inclinação incorreta da evaporadora
- **Cheiro de mofo / odor ruim**: fungos e bactérias nos filtros — higienização necessária
- **Não liga**: problema elétrico, fusível, placa eletrônica ou controle remoto
- **Fica ligando e desligando (short cycling)**: possível sobrecarga ou carga de gás incorreta
- **Consumo de energia alto**: filtros sujos ou gás insuficiente podem aumentar até 30% o consumo
- **Condensadora muito quente**: falta de ventilação ao redor ou condensador sujo
- **Erro no display**: cada marca tem código específico — peça o código para diagnóstico preciso
- **Remote control não funciona**: primeiro troque as pilhas; se persistir pode ser receptor IR

### PMOC — Contrato de Manutenção
- Obrigatório para: clínicas, hospitais, escritórios acima de 60m², academias, restaurantes, hotéis, condomínios
- O que inclui: visitas periódicas, relatório técnico, planilha ANVISA, laudo anual
- Multa para quem não possui: autuação pela ANVISA / Vigilância Sanitária
- Preço: varia com número de aparelhos e frequência de visitas

### Eficiência energética
- Prefira aparelhos Inverter: economizam 30–60% de energia vs. convencional
- Etiqueta PROCEL: quanto mais A, mais eficiente
- Um ar-condicionado sujo pode aumentar o consumo em até 30%
- Temperatura ideal recomendada: 23–24°C (cada grau a mais = ~5% menos energia)

## OBJEÇÕES COMUNS
- "Caro": "Nosso diagnóstico é gratuito! Depois de ver o problema exato, pode ser mais simples. Com manutenção preventiva você economiza até 30% de energia e evita trocas de peças caras."
- "Vou pensar": "Claro! Mas se o aparelho já não está resfriando bem, cada dia pode piorar. Deixa eu ao menos garantir uma data gratuita na agenda?"
- "Tenho outro orçamento": "Ótimo! Compare os serviços incluídos — emitimos laudo técnico, garantia oficial e PMOC. Qual valor você recebeu?"
- "Só quero o preço": "Para um preço exato preciso saber o modelo e o problema. Posso te dar uma estimativa agora!"
- Urgência real: Priorizar, mencionar técnicos disponíveis e WhatsApp imediato.

## SEU OBJETIVO
1. Cumprimentar e criar rapport
2. Descobrir NOME do cliente
3. Identificar SERVIÇO necessário (ou responder dúvida técnica)
4. Qualificar: RESIDENCIAL ou EMPRESARIAL
5. Avaliar URGÊNCIA
6. Superar objeções
7. CONVERTER: agendamento Calendly OU WhatsApp

## AÇÕES DISPONÍVEIS
Inclua JSON no final da resposta (após o texto). O cliente NÃO vê.

Para abrir Calendly: {"action":"calendly"}
Para abrir WhatsApp: {"action":"whatsapp","msg":"[mensagem pré-redigida]"}
Para mostrar quick replies: {"action":"quickreplies","options":["Op1","Op2","Op3"]}
Para capturar lead: {"action":"lead","nome":"X","servico":"X","tipo":"X","urgencia":"X"}

IMPORTANTE:
- Combine ações quando fizer sentido
- Máximo 1 ação "calendly" ou "whatsapp" por mensagem
- Nunca simule conversa ou finja ser o cliente
- Se o cliente digitar em outro idioma, responda em português do Brasil
- Respostas CURTAS e diretas (máx 5 parágrafos)
- Para perguntas técnicas: responda de forma completa e depois ofereça agendar
- Lembre-se: você é o LUCAS
`;

/* ═══════════════════════════════════════════════════════════
   📦  ESTADO GLOBAL
   ═══════════════════════════════════════════════════════════ */
let conversationHistory = [];
let leadData = {};
let isOpen = false;
let isLoading = false;
let initInProgress = false;

/* ═══════════════════════════════════════════════════════════
   🌐  GEMINI API
   ═══════════════════════════════════════════════════════════ */
async function callGemini(userMessage) {
    const useProxy  = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO');
    const useDirect = !useProxy && CONFIG.GEMINI_API_KEY;

    if (!useProxy && !useDirect) throw new Error('Configure PROXY_URL ou GEMINI_API_KEY em CONFIG.');

    const endpoint = useProxy
        ? CONFIG.PROXY_URL
        : `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

    conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    /* Mantém exatamente as últimas 10 trocas (20 entradas) */
    if (conversationHistory.length > 20) conversationHistory.splice(0, conversationHistory.length - 20);

    const body = {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: conversationHistory,
        generationConfig: { temperature: 0.75, topP: 0.95, maxOutputTokens: 1024 },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
    };

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timer);

            /* Retry automático em erros 5xx */
            if (res.status >= 500 && attempt < 2) {
                lastErr = new Error(`HTTP ${res.status}`);
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!fullText) throw new Error('Resposta vazia do provedor de IA');
            conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
            saveHistoryToSession();
            return fullText;
        } catch (e) {
            clearTimeout(timer);
            lastErr = e.name === 'AbortError' ? new Error('Tempo limite excedido (15s)') : e;
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    throw lastErr;
}

/* ═══════════════════════════════════════════════════════════
   🔧  PARSER DE AÇÕES
   ═══════════════════════════════════════════════════════════ */
function parseAIResponse(rawText) {
    const actions = [];
    let displayText = rawText;

    const jsonRegex = /\{(?:[^{}]|\{[^{}]*\})*\}/g;
    const matches = rawText.match(jsonRegex) || [];

    for (const match of matches) {
        try {
            const obj = JSON.parse(match);
            if (obj.action) {
                actions.push(obj);
                displayText = displayText.replace(match, '').trim();
            }
        } catch (e) { /* skip */ }
    }

    return { displayText: displayText.trim(), actions };
}

/* ═══════════════════════════════════════════════════════════
   📤  ENVIO DE LEAD
   ═══════════════════════════════════════════════════════════ */
async function sendLead(data) {
    const payload = { ...data, timestamp: new Date().toISOString(), origem: 'chatbot' };

    /* Persiste localmente mesmo sem proxy */
    try { localStorage.setItem('rn_last_lead', JSON.stringify(payload)); } catch {}

    const proxyUrl = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO')
        ? CONFIG.PROXY_URL : null;
    if (!proxyUrl) return;

    try {
        await fetch(`${proxyUrl}/lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch {}
}

/* ═══════════════════════════════════════════════════════════
   ⚡  EXECUTOR DE AÇÕES
   ═══════════════════════════════════════════════════════════ */
function executeActions(actions) {
    const quickReplies = [];

    for (const act of actions) {
        switch (act.action) {
            case 'lead':
                if (act.nome)     leadData.nome     = act.nome;
                if (act.servico)  leadData.servico  = act.servico;
                if (act.tipo)     leadData.tipo     = act.tipo;
                if (act.urgencia) leadData.urgencia = act.urgencia;
                sendLead(leadData);
                break;

            case 'calendly':
                setTimeout(() => abrirCalendly(), 800);
                break;

            case 'whatsapp':
                const msg = act.msg || buildWhatsAppMsg();
                setTimeout(() => {
                    window.open(`https://wa.me/${CONFIG.WHATSAPP_NUM}?text=${encodeURIComponent(msg)}`, '_blank');
                }, 800);
                break;

            case 'quickreplies':
                if (Array.isArray(act.options)) quickReplies.push(...act.options);
                break;
        }
    }

    return quickReplies;
}

/* ═══════════════════════════════════════════════════════════
   📨  FLUXO PRINCIPAL
   ═══════════════════════════════════════════════════════════ */
async function processarMensagem(texto) {
    if (isLoading) return;
    isLoading = true;
    setInputEnabled(false);

    try {
        const useProxy  = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO');
        const useDirect = !useProxy && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.length > 10;
        const keyOk     = useProxy || useDirect;

        let displayText, actions;

        if (keyOk) {
            showTyping();
            const raw = await callGemini(texto);
            ({ displayText, actions } = parseAIResponse(raw));
        } else {
            await new Promise(r => setTimeout(r, 600));
            ({ displayText, actions } = fallbackResponse(texto));
        }

        if (displayText) appendBotMsg(displayText);

        const qrOptions = executeActions(actions);
        if (qrOptions.length > 0) appendQuickReplies(qrOptions);

    } catch (err) {
        console.error('[Lucas] Erro IA:', err);
        /* Degrada para fallback local por palavras-chave antes de mostrar erro */
        try {
            const { displayText, actions } = fallbackResponse(texto);
            if (displayText) appendBotMsg(displayText);
            const qrOptions = executeActions(actions);
            if (qrOptions.length > 0) appendQuickReplies(qrOptions);
        } catch {
            appendBotMsg(`Estou com instabilidade no momento. 😅 Pode me chamar direto no WhatsApp ou tentar novamente em instantes!`);
            appendQuickReplies(['📱 Chamar no WhatsApp', '🔄 Tentar novamente']);
        }
    } finally {
        hideTyping(); /* sempre remove o indicador, mesmo em erro */
        isLoading = false;
        setInputEnabled(true);
    }
}

/* ═══════════════════════════════════════════════════════════
   🔄  FALLBACK EXPANDIDO (sem API key configurada)
   ═══════════════════════════════════════════════════════════ */
function fallbackResponse(texto) {
    const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Encerramento da conversa
    if (/\b(obrigad|valeu|tchau|ate mais|encerrando|ate logo|flw|foi|agendei|agendado|ja agendei|combinado|certo|beleza|perfeito|ok obrigado|entendido|feito)\b/.test(t)) {
        return {
            displayText: `De nada! 😊 Foi um prazer ajudar.\n\nQualquer dúvida sobre seu ar-condicionado, é só chamar. Bom atendimento! 🌡️`,
            actions: []
        };
    }

    // Saudações
    if (/^(oi|ola|ola!|bom dia|boa tarde|boa noite|hey|e ai|eai|opa|salve)\b/.test(t.trim())) {
        return {
            displayText: `Olá! 👋 Sou o **Lucas**, especialista em climatização da **Renostter**!\n\nPosso te ajudar com qualquer dúvida sobre ar-condicionado — instalação, manutenção, problemas técnicos, preços e mais.\n\n**Como posso te ajudar hoje?**`,
            actions: [{ action: 'quickreplies', options: ['🚨 Meu aparelho parou!', '🔧 Instalação', '✨ Higienização', '🔍 Manutenção', '💨 Problema de gás', '📋 PMOC Empresarial', '💰 Preços', '❓ Dúvida técnica'] }]
        };
    }

    const checks = [
        // ─── URGÊNCIAS ────────────────────────────────────────────
        {
            kw: ['parou agora', 'nao liga', 'nao funciona', 'urgente', 'emergencia', 'quebrou', 'parou de funcionar', 'nao esta ligando', 'travou', 'com defeito', 'defeito', 'mal funcionando', 'estrago', 'estragou', 'pifou'],
            resp: `🚨 **Caso urgente — estamos aqui!**\n\nMe informe seu nome e bairro que direcionamos um técnico o mais rápido possível. Para atendimento **imediato**, chame pelo WhatsApp agora mesmo! 📱`,
            qr: ['📱 WhatsApp urgente', '📅 Agendar técnico hoje']
        },
        // ─── NÃO RESFRIA / GÁS ────────────────────────────────────
        {
            kw: ['nao resfria', 'nao esta gelando', 'nao gela', 'pouco frio', 'fraco', 'quente', 'nao esta frio', 'esta quente', 'falta de gas', 'sem gas', 'gas acabou', 'recarga', 'recarregar gas', 'gelo', 'congelado', 'congelando', 'formando gelo', 'gelando demais', 'cheio de gelo'],
            resp: `Se o aparelho **não está resfriando bem**, as causas mais comuns são:\n\n🔹 **Falta de gás** (vazamento no circuito)\n🔹 **Filtro entupido** — aumenta até 30% o consumo sem resfriar direito\n🔹 **Condensadora suja** — perde eficiência no verão\n\n💨 Recarga de gás a partir de **R$ 160** com diagnóstico incluso.\n\nQuer agendar uma visita técnica? Diagnóstico é grátis! 😊`,
            qr: ['📅 Agendar diagnóstico grátis', '📱 WhatsApp urgente']
        },
        // ─── BARULHO / RUÍDO ─────────────────────────────────────
        {
            kw: ['barulho', 'ruido', 'fazendo som', 'vibrando', 'chacoalhando', 'estranhando', 'ronco', 'chiado', 'barulhento', 'trepidando'],
            resp: `Barulho anormal no ar-condicionado pode ter várias causas:\n\n🔊 **Vibração/Chacoalhando** → suporte da condensadora solto ou peças desgastadas\n🔊 **Chiado** → pode ser gás com pressão incorreta ou compressor\n🔊 **Cliques repetidos** → possível problema elétrico ou de partida\n\nTodos esses problemas têm solução! Agende um diagnóstico grátis e identificamos a causa.`,
            qr: ['📅 Agendar diagnóstico', '📱 Falar com técnico']
        },
        // ─── GOTEJANDO / ÁGUA ─────────────────────────────────────
        {
            kw: ['gotejando', 'vazando agua', 'pingando', 'agua caindo', 'dreno', 'agua no chao', 'vazamento de agua', 'escorrendo', 'vazamento', 'pingo', 'molhando', 'molhado'],
            resp: `Água escorrendo do ar-condicionado é um sinal de:\n\n💧 **Dreno entupido** → a água não consegue escoar (causa mais comum)\n💧 **Inclinação incorreta** da evaporadora → água vai para o lado errado\n💧 **Gás baixo** → forma gelo que derrete e causa goteira\n\nÉ importante resolver rápido para evitar danos à parede e ao equipamento!\n\nAgende uma visita — Manutenção Preventiva a partir de **R$ 150**.`,
            qr: ['📅 Agendar manutenção', '📱 Chamar agora no WhatsApp']
        },
        // ─── CHEIRO / MOFO ────────────────────────────────────────
        {
            kw: ['cheiro', 'cheirando', 'odor', 'mofo', 'mau cheiro', 'fedendo', 'fedorento', 'cheiro ruim', 'cheiro estranho', 'fumaca', 'queimado'],
            resp: `Cheiro no ar-condicionado é sinal de alerta!\n\n🦠 **Cheiro de mofo** → fungos e bactérias nos filtros e evaporadora — **higienização urgente** para sua saúde\n🔥 **Cheiro de queimado** → problema elétrico — desligue o aparelho imediatamente e chame um técnico!\n\n✨ **Higienização completa** a partir de **R$ 120/aparelho** — elimina 99% dos microrganismos com bactericida profissional.`,
            qr: ['✨ Agendar higienização', '📱 WhatsApp urgente']
        },
        // ─── INSTALAÇÃO ───────────────────────────────────────────
        {
            kw: ['instalacao', 'instalar', 'colocar ar', 'montar', 'nova instalacao', 'instalar split', 'instalacao split'],
            resp: `Ótimo! A **instalação** na Renostter inclui:\n\n✅ Split, Multi-Split, Cassete, Piso-Teto e VRF\n✅ Suporte de fixação e tubulação de cobre\n✅ Laudo técnico + garantia de 90 dias\n✅ Testamos tudo antes de sair\n\n💰 A partir de **R$ 280** (Split até 18.000 BTU)\n\nQuer um orçamento preciso? É só agendar!`,
            qr: ['📅 Agendar visita', '📱 Pedir orçamento no WhatsApp', '❓ Qual BTU preciso?']
        },
        // ─── CÁLCULO DE BTU ───────────────────────────────────────
        {
            kw: ['btu', 'quantos btu', 'qual tamanho', 'qual capacidade', 'btu preciso', 'qual modelo comprar', 'qual ar comprar', 'tamanho do ar'],
            resp: `Para calcular o BTU ideal, use esta referência:\n\n📐 Até 10m² → 7.000–9.000 BTU\n📐 10–15m² → 9.000–12.000 BTU\n📐 15–20m² → 12.000–18.000 BTU\n📐 20–30m² → 18.000–24.000 BTU\n📐 30–40m² → 24.000–30.000 BTU\n\n**Atenção:** adicione 600 BTU por pessoa extra e 600 BTU se o ambiente pega muito sol ou é uma cozinha. Para ambientes comerciais com equipamentos, adicione 10–20%.\n\nQuer uma recomendação personalizada para o seu caso?`,
            qr: ['📱 Pedir recomendação personalizada', '📅 Agendar visita técnica']
        },
        // ─── MANUTENÇÃO PREVENTIVA ────────────────────────────────
        {
            kw: ['manutencao', 'manutencao preventiva', 'revisao', 'checar', 'verificar', 'inspecao', 'revisionar'],
            resp: `A **manutenção preventiva** é essencial!\n\n✅ Prolonga a vida útil do equipamento\n✅ Reduz consumo de energia em até 30%\n✅ Previne problemas maiores e caros\n✅ Inclui laudo técnico e relatório\n\n💰 A partir de **R$ 150** | Duração: ~2h\n\n**Frequência recomendada:** a cada 6 meses para residências, a cada 3 meses para empresas.\n\nQuer agendar?`,
            qr: ['🏠 Manutenção residencial', '🏢 Manutenção empresarial', '📅 Ver datas disponíveis']
        },
        // ─── MANUTENÇÃO CORRETIVA ─────────────────────────────────
        {
            kw: ['conserto', 'consertar', 'corretiva', 'reparo', 'reparar', 'trocar peca', 'peca quebrada', 'placa', 'compressor', 'capacitor'],
            resp: `A **manutenção corretiva** resolve o problema de vez!\n\n🔧 Diagnóstico **gratuito** — identificamos a causa exata\n🔧 Orçamento aprovado antes de qualquer serviço\n🔧 Garantia de 90 dias no serviço + até 12 meses em peças\n\n💰 A partir de **R$ 200** (valor final conforme diagnóstico)\n\nMe conta o que está acontecendo com o aparelho para eu te ajudar melhor!`,
            qr: ['📅 Agendar diagnóstico grátis', '📱 Descrever problema no WhatsApp']
        },
        // ─── HIGIENIZAÇÃO ─────────────────────────────────────────
        {
            kw: ['higienizacao', 'higienizar', 'limpeza', 'limpar filtro', 'limpar ar', 'bactericida', 'desinfecao'],
            resp: `A **higienização completa** elimina o que você não vê!\n\n🦠 Remove fungos, bactérias e ácaros dos filtros e evaporadora\n🌿 Melhora a qualidade do ar e previne alergias\n💨 Elimina odores desagradáveis\n✅ Bactericida profissional certificado\n\n💰 **R$ 120/aparelho** | Duração: ~1,5h\n\nIdeal fazer a cada 6–12 meses (ou sempre que notar cheiro!). Agendar agora? 😊`,
            qr: ['📅 Agendar higienização', '📱 Falar no WhatsApp']
        },
        // ─── PMOC / EMPRESARIAL ───────────────────────────────────
        {
            kw: ['pmoc', 'empresa', 'clinica', 'hospital', 'condominio', 'comercial', 'escritorio', 'academia', 'restaurante', 'hotel', 'anvisa', 'vigilancia sanitaria'],
            resp: `O **PMOC (Plano de Manutenção, Operação e Controle)** é exigido por lei!\n\n📋 Obrigatório para: clínicas, hospitais, escritórios >60m², academias, restaurantes, hotéis e condomínios\n✅ Emitimos toda documentação exigida pela ANVISA\n✅ Atendemos normas ABNT NBR 16.401\n✅ Relatórios e planilhas mensais/trimestrais\n⚠️ Sem PMOC: risco de autuação pela Vigilância Sanitária\n\nMe fala quantos aparelhos e o tipo de ambiente para passar o orçamento!`,
            qr: ['📱 Pedir orçamento PMOC', '📅 Agendar visita técnica']
        },
        // ─── GÁS REFRIGERANTE / TIPOS ────────────────────────────
        {
            kw: ['r410', 'r-410', 'r32', 'r-32', 'r22', 'r-22', 'freon', 'tipo de gas', 'qual gas', 'gás refrigerante', 'gas refrigerante'],
            resp: `**Guia dos gases refrigerantes:**\n\n❄️ **R-410A** → padrão de 2010–2019; não agride a camada de ozônio; ainda muito comum\n🌱 **R-32** → mais eficiente e ecológico; padrão nos aparelhos novos (desde 2019); menor GWP\n⚠️ **R-22 (Freon)** → antigo; importação proibida desde 2015; ainda fazemos recargas com estoque certificado\n🏭 **R-404A** → para câmaras frias e industrial\n\nTrabalha com todos eles! Qual é o modelo e ano do seu aparelho?`,
            qr: ['💨 Preciso de recarga', '📱 Falar com técnico']
        },
        // ─── MARCAS ───────────────────────────────────────────────
        {
            kw: ['marca', 'daikin', 'samsung', 'lg', 'midea', 'gree', 'springer', 'carrier', 'trane', 'fujitsu', 'hitachi', 'york', 'elgin', 'philco', 'electrolux', 'komeco', 'agratto'],
            resp: `Atendemos **todas as marcas** de ar-condicionado! ✅\n\nDaikin, LG, Samsung, Midea, Gree, Springer Carrier, Trane, Fujitsu, Hitachi, York, Elgin, Philco, Electrolux, Komeco, Agratto, Bosch, Mitsubishi e mais.\n\nNossos técnicos têm treinamento em todas elas. Qual é a marca e o modelo do seu aparelho?`,
            qr: ['📅 Agendar visita', '📱 Chamar no WhatsApp']
        },
        // ─── TIPOS DE APARELHO ────────────────────────────────────
        {
            kw: ['split', 'cassete', 'piso teto', 'multi split', 'multisplit', 'vrf', 'vrv', 'portatil', 'janeleiro', 'tipo de ar'],
            resp: `**Tipos de ar-condicionado que instalamos e atendemos:**\n\n🔹 **Split Hi-Wall** — mais comum; 1 ambiente; fácil instalação\n🔹 **Multi-Split** — 1 condensadora para 2–5 ambientes; economiza espaço externo\n🔹 **Cassete** — embutido no teto/forro; ideal para salas grandes\n🔹 **Piso-Teto** — sem obras no teto; bom para garagens e industriais\n🔹 **VRF/VRV** — grande porte; múltiplas zonas independentes\n\nPrecisa de ajuda para escolher o tipo ideal para o seu espaço?`,
            qr: ['📱 Pedir recomendação', '📅 Agendar visita técnica']
        },
        // ─── PREÇOS / VALORES ─────────────────────────────────────
        {
            kw: ['preco', 'valor', 'quanto custa', 'quanto e', 'quanto fica', 'tabela', 'custo', 'orcamento', 'orcar', 'desconto', 'promocao', 'promo', 'oferta', 'cupom', 'mais barato', 'barato'],
            resp: `**Tabela de referência Renostter:**\n\n💰 Higienização: a partir de **R$ 120/aparelho**\n💰 Manutenção Preventiva: a partir de **R$ 150**\n💰 Instalação Split: a partir de **R$ 280**\n💰 Manutenção Corretiva: a partir de **R$ 200** (diagnóstico grátis)\n💰 Recarga de Gás: a partir de **R$ 160**\n💰 Contrato Mensal: a partir de **R$ 90/mês**\n\n**Formas de pagamento:** PIX (5% off), cartão em até 12x, dinheiro, transferência.\n\nO preço exato depende do modelo e situação. Quer um orçamento gratuito?`,
            qr: ['📅 Orçamento grátis', '📱 Chamar agora']
        },
        // ─── PAGAMENTO / PARCELAMENTO ─────────────────────────────
        {
            kw: ['pagamento', 'parcelar', 'parcelamento', 'cartao', 'pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia', 'forma de pagamento'],
            resp: `**Formas de pagamento aceitas:**\n\n💳 **Cartão de crédito** — em até **12x** sem juros\n📱 **PIX** — ganhe **5% de desconto**\n💵 Dinheiro\n🏦 Transferência bancária\n🧾 Boleto (contratos empresariais)\n\nBem fácil, né? Quer agendar o serviço? 😊`,
            qr: ['📅 Agendar agora', '📱 Chamar no WhatsApp']
        },
        // ─── HORÁRIO DE ATENDIMENTO ───────────────────────────────
        {
            kw: ['horario', 'horario de atendimento', 'funcionamento', 'expediente', 'quando voces atendem', 'que horas', 'aberto', 'fechado', 'sabado', 'domingo', 'feriado'],
            resp: `**Horário de atendimento Renostter:**\n\n📅 **Segunda a Sexta:** 08h00 às 18h00\n📅 **Sábado:** 08h00 às 14h00\n📅 **Domingo/Feriado:** Apenas emergências via WhatsApp\n\n🚨 Para urgências (aparelho parado), temos suporte 24h pelo WhatsApp mesmo fora do horário comercial!`,
            qr: ['📅 Agendar visita', '📱 WhatsApp agora']
        },
        // ─── ÁREA DE ATENDIMENTO ──────────────────────────────────
        {
            kw: ['atende', 'area de atendimento', 'bairro', 'cidade', 'regiao', 'zona', 'onde voces', 'sao paulo', 'grande sp', 'abc', 'guarulhos', 'osasco', 'santo andre', 'sao bernardo', 'carapicuiba', 'barueri', 'mogi', 'sp'],
            resp: `Atendemos **São Paulo e toda a Grande SP!** 📍\n\nIncluindo: São Paulo (todos os bairros), ABC Paulista (Santo André, São Bernardo, São Caetano, Diadema), Guarulhos, Osasco, Barueri, Carapicuíba, Mogi das Cruzes, Suzano, Itaquaquecetuba e região.\n\nMe fala seu bairro ou cidade e confirmo a disponibilidade de agenda!`,
            qr: ['📅 Verificar disponibilidade', '📱 Confirmar no WhatsApp']
        },
        // ─── GARANTIA / LAUDO ─────────────────────────────────────
        {
            kw: ['garantia', 'laudo', 'certificado', 'documento', 'nota fiscal', 'comprovante', 'relatorio'],
            resp: `A Renostter emite documentação completa em todos os serviços:\n\n✅ **Laudo Técnico Oficial** — registra o estado do equipamento antes e depois\n✅ **90 dias** de garantia nos serviços (CDC Art. 26)\n✅ **Até 12 meses** de garantia em peças trocadas\n✅ **PMOC** conforme Portaria 3.523/MS e ABNT NBR 16.401\n✅ Todos os documentos necessários para a Vigilância Sanitária\n\nTudo documentado, sem surpresas!`,
            qr: ['📅 Agendar serviço', '📱 Falar com especialista']
        },
        // ─── FREQUÊNCIA DE MANUTENÇÃO ─────────────────────────────
        {
            kw: ['de quanto em quanto tempo', 'frequencia', 'periodicidade', 'quantas vezes por ano', 'quando fazer manutencao', 'quando limpar'],
            resp: `**Frequência recomendada de manutenção:**\n\n🏠 **Residencial uso normal** → a cada 6 meses (ou 12 meses se uso leve)\n🏢 **Comercial/Escritórios** → a cada 3 meses\n🏥 **Clínicas e Hospitais** → mensal (PMOC obrigatório)\n🍞 **Padarias, obras, ambientes com muita poeira** → a cada 2–3 meses\n\nA manutenção regular pode reduzir o consumo de energia em até 30% e triplicar a vida útil do equipamento! Vale muito a pena.`,
            qr: ['📅 Agendar manutenção', '📋 Contratos de manutenção']
        },
        // ─── EFICIÊNCIA ENERGÉTICA / INVERTER ────────────────────
        {
            kw: ['inverter', 'eficiencia', 'gasta energia', 'conta de luz', 'economia', 'consumo', 'kwh', 'procel', 'temperatura ideal'],
            resp: `**Dicas de economia com ar-condicionado:**\n\n⚡ **Inverter** economiza 30–60% vs. convencional — vale o investimento!\n🌡️ **Temperatura ideal:** 23–24°C (cada grau a menos = +5% de consumo)\n🧹 **Filtro limpo** pode reduzir o consumo em até 30%\n🌬️ **Ventiladores de teto** em conjunto permitem usar o AC em temperatura mais alta\n🔒 **Vedação de janelas e portas** evita que o frio escape\n\nSe o seu aparelho está gastando muito, pode ser sinal de filtro sujo ou gás baixo. Quer um diagnóstico?`,
            qr: ['📅 Diagnóstico de eficiência', '📱 Chamar no WhatsApp']
        },
        // ─── BIP / BUZINA / APITANDO ──────────────────────────────
        {
            kw: ['bip', 'bipando', 'beep', 'buzina', 'buzinando', 'apitando', 'apita', 'emitindo som', 'barulho de alarme', 'alarmando'],
            resp: `Som de bip ou buzina no ar-condicionado geralmente indica:\n\n🔔 **Bip único ao ligar/desligar** → normal (confirmação de comando)\n🔔 **Bips repetidos contínuos** → pode ser código de erro na placa eletrônica\n🔔 **Bip de alarme** → proteção ativada (sobrecarga, superaquecimento, pressão anormal)\n\nO número de bips geralmente corresponde a um código de erro específico da marca.\n\nMe diga a **marca e modelo** do aparelho e quantos bips ele emite — posso te ajudar a identificar o problema!`,
            qr: ['📱 Enviar vídeo do barulho no WhatsApp', '📅 Agendar diagnóstico grátis']
        },
        // ─── DÚVIDA TÉCNICA GENÉRICA ──────────────────────────────
        {
            kw: ['por que', 'como funciona', 'qual a diferenca', 'qual e melhor', 'me explica', 'explicar', 'entender', 'diferenca entre', 'o que e', 'o que significa'],
            resp: `Boa pergunta! Sou especialista em climatização e posso explicar qualquer dúvida técnica sobre ar-condicionado. 🤓\n\nAlguns temas que respondo agora:\n\n🔹 Cálculo de BTU ideal para seu ambiente\n🔹 Diferença entre Split, Multi-Split, Cassete, VRF\n🔹 Gases refrigerantes (R-32, R-410A, R-22)\n🔹 Inverter vs. Convencional\n🔹 Frequência de manutenção ideal\n🔹 Como interpretar códigos de erro\n\n**Qual é a sua dúvida?** Me conta em detalhes!`,
            qr: ['❓ Calcular BTU', '🔧 Tipos de aparelho', '💨 Gases refrigerantes', '⚡ Inverter vs. Convencional']
        },
        // ─── ERRO NO DISPLAY / CÓDIGO ─────────────────────────────
        {
            kw: ['codigo de erro', 'erro no display', 'piscando', 'led piscando', 'e1', 'e2', 'e3', 'f1', 'f2', 'h1', 'h2', 'p1', 'p2', 'exibindo erro'],
            resp: `Os códigos de erro variam de marca para marca. Me diz:\n\n🔹 Qual a **marca e modelo** do aparelho?\n🔹 Qual o **código exibido** (ex: E1, F2, H1)?\n\nCom essas informações consigo te dizer exatamente o que significa. Na maioria dos casos é diagnóstico e reparo simples! Podemos também agendar um técnico para avaliar.`,
            qr: ['📱 Enviar foto do código no WhatsApp', '📅 Agendar diagnóstico']
        },
        // ─── CONTROLE REMOTO ──────────────────────────────────────
        {
            kw: ['controle remoto', 'controle nao funciona', 'sem controle', 'controle estragou', 'controle quebrou', 'nao responde ao controle'],
            resp: `**Problemas com controle remoto?**\n\n🔋 Primeiro passo: troque as **pilhas** (mesmo que pareçam boas)\n📡 Aponte diretamente para o sensor da evaporadora (sem obstáculos)\n🌞 Evite luz solar intensa que pode interferir no sensor IR\n\nSe mesmo assim não funcionar, pode ser o **receptor infravermelho** da evaporadora ou o controle em si. Temos controles universais e originais disponíveis!\n\nQuer agendar uma visita?`,
            qr: ['📅 Agendar visita', '📱 Chamar no WhatsApp']
        },
        // ─── PINTURA DE EQUIPAMENTO ───────────────────────────────
        {
            kw: ['pintura', 'pintar ar', 'personalizar', 'customizar', 'cor diferente', 'trocar cor', 'pintura automotiva'],
            resp: `Serviço **exclusivo Renostter** — Pintura de Equipamento! 🎨\n\n✅ Tinta automotiva de alta durabilidade\n✅ Mais de 50 cores disponíveis\n✅ Proteção UV e anticorrosão\n✅ Acabamento premium\n✅ Personalizamos também dutos, grelhas e controles!\n\nIdeal para combinar com a decoração do seu ambiente. Preço sob consulta. Quer saber mais?`,
            qr: ['📱 Solicitar orçamento de pintura', '📅 Agendar visita']
        },
        // ─── REMOÇÃO / REINSTALAÇÃO ───────────────────────────────
        {
            kw: ['remocao', 'remover', 'tirar o ar', 'mudanca', 'mudar o ar', 'reinstalar', 'reinstalacao', 'muda de lugar'],
            resp: `Sim! Fazemos **remoção e reinstalação** com toda segurança.\n\n✅ Reaproveitamos a tubulação quando possível\n✅ Desmontagem e remontagem cuidadosa\n✅ Teste completo após a reinstalação\n\n💰 A partir de **R$ 200** | Duração: ~3h\n\nÉ uma mudança de imóvel ou dentro do mesmo local?`,
            qr: ['📅 Agendar remoção/reinstalação', '📱 Chamar no WhatsApp']
        },
        // ─── CONTRATO DE MANUTENÇÃO ───────────────────────────────
        {
            kw: ['contrato', 'plano mensal', 'manutencao mensal', 'visita mensal', 'pacote de manutencao', 'assinar contrato'],
            resp: `Os **Contratos de Manutenção** da Renostter são a solução mais econômica!\n\n✅ Visitas programadas (mensal, trimestral ou semestral)\n✅ Prioridade no atendimento emergencial\n✅ Desconto especial nos serviços corretivos\n✅ Laudo e documentação incluídos\n\n💰 A partir de **R$ 90/mês** (mínimo 6 meses)\n\nIdeal para empresas e condomínios! Quantos aparelhos você tem?`,
            qr: ['📱 Pedir proposta de contrato', '📅 Agendar avaliação']
        },
        // ─── AGENDAMENTO ──────────────────────────────────────────
        {
            kw: ['agendar', 'agenda', 'data disponivel', 'horario disponivel', 'calendly', 'marcar visita', 'visita tecnica', 'quando pode vir'],
            resp: `Ótimo! Vou abrir nosso agendamento online para você escolher o melhor dia e horário. 📅`,
            qr: [],
            actions: [{ action: 'calendly' }]
        },
        // ─── WHATSAPP ─────────────────────────────────────────────
        {
            kw: ['whatsapp', 'zap', 'ligar', 'telefone', 'chamar', 'numero', 'contato', 'falar direto', 'falar com humano', 'atendente'],
            resp: `Vou te encaminhar ao WhatsApp agora! Nossa equipe responde rapidinho. 📱`,
            actions: [{ action: 'whatsapp', msg: buildWhatsAppMsg() }]
        },
        // ─── SOBRE A EMPRESA ──────────────────────────────────────
        {
            kw: ['sobre a empresa', 'quem sao voces', 'a renostter', 'ha quanto tempo', 'anos de experiencia', 'cnpj', 'empresa confiavel', 'quantas instalacoes'],
            resp: `**Renostter Climatização** — sua especialista em ar-condicionado em SP! 🏢\n\n⭐ +5 anos de experiência\n🔧 +4.500 instalações realizadas\n⭐ 4,9 estrelas no Google\n📋 Laudo técnico e PMOC em todos os serviços\n📍 Atendemos SP e Grande SP\n\nSomos uma empresa registrada, com técnicos certificados e todo equipamento homologado. Sua satisfação e segurança são nossa prioridade!`,
            qr: ['📅 Agendar serviço', '💰 Ver preços', '📱 Falar com a equipe']
        },
    ];

    for (const check of checks) {
        if (check.kw.some(k => t.includes(k))) {
            return {
                displayText: check.resp,
                actions: [
                    ...(check.actions || []),
                    ...(check.qr?.length ? [{ action: 'quickreplies', options: check.qr }] : [])
                ]
            };
        }
    }

    // Default
    return {
        displayText: `Olá! Sou o **Lucas**, especialista em climatização da **Renostter**! 😊\n\nPode me perguntar qualquer coisa sobre ar-condicionado — instalação, manutenção, problemas, preços, BTU, marcas, e muito mais.\n\n**Como posso te ajudar hoje?**`,
        actions: [{ action: 'quickreplies', options: ['🚨 Meu aparelho parou!', '🔧 Instalação', '✨ Higienização', '🔍 Manutenção', '💨 Problema de gás', '📋 PMOC Empresarial', '💰 Preços', '❓ Calcular BTU'] }]
    };
}

function buildWhatsAppMsg() {
    const { nome, servico, tipo } = leadData;
    return `Olá! ${nome ? `Me chamo *${nome}*. ` : ''}${servico ? `Preciso de *${servico}*` : 'Gostaria de um orçamento'}${tipo ? ` (${tipo})` : ''}. Vi o site da Renostter!`;
}

/* ═══════════════════════════════════════════════════════════
   💾  SESSION STORAGE
   ═══════════════════════════════════════════════════════════ */
function saveHistoryToSession() {
    try { sessionStorage.setItem('rn_chat_history', JSON.stringify(conversationHistory)); } catch {}
}

function loadHistoryFromSession() {
    try {
        const raw = sessionStorage.getItem('rn_chat_history');
        if (raw) conversationHistory = JSON.parse(raw);
    } catch {}
}

function clearHistoryFromSession() {
    try { sessionStorage.removeItem('rn_chat_history'); } catch {}
    conversationHistory = [];
}

/* ═══════════════════════════════════════════════════════════
   🔒  CONTROLE DE INPUT
   ═══════════════════════════════════════════════════════════ */
function setInputEnabled(enabled) {
    const input = getEl('chatInput');
    const btn   = getEl('chatSendBtn');
    if (input) input.disabled = !enabled;
    if (btn)   btn.disabled   = !enabled;
}

/* ═══════════════════════════════════════════════════════════
   🎨  RENDERIZAÇÃO
   ═══════════════════════════════════════════════════════════ */
function getEl(id) { return document.getElementById(id); }

function sanitizeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatText(text) {
    const safe = sanitizeHTML(text);
    return safe
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n• /g, '<br>• ')
        .replace(/\n🔹/g, '<br>🔹')
        .replace(/\n✅/g, '<br>✅')
        .replace(/\n⚠️/g, '<br>⚠️')
        .replace(/\n🔊/g, '<br>🔊')
        .replace(/\n💧/g, '<br>💧')
        .replace(/\n💰/g, '<br>💰')
        .replace(/\n📅/g, '<br>📅')
        .replace(/\n📐/g, '<br>📐')
        .replace(/\n❄️/g, '<br>❄️')
        .replace(/\n🌱/g, '<br>🌱')
        .replace(/\n🏠/g, '<br>🏠')
        .replace(/\n🏢/g, '<br>🏢')
        .replace(/\n🏥/g, '<br>🏥')
        .replace(/\n🍞/g, '<br>🍞')
        .replace(/\n⚡/g, '<br>⚡')
        .replace(/\n🌡️/g, '<br>🌡️')
        .replace(/\n🧹/g, '<br>🧹')
        .replace(/\n🌬️/g, '<br>🌬️')
        .replace(/\n🔒/g, '<br>🔒')
        .replace(/\n/g, '<br>');
}

function appendBotMsg(text) {
    const body = getEl('chatBody');
    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.innerHTML = `
    <div class="chat-avatar"><img src="assets/lucas-ai.jpg" alt="Lucas"></div>
    <div class="chat-bubble">${formatText(text)}</div>`;
    body.appendChild(div);
    scrollBottom();
}

function appendUserMsg(text) {
    const body = getEl('chatBody');
    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = `<div class="chat-bubble">${formatText(text)}</div>`;
    body.appendChild(div);
    scrollBottom();
}

function appendQuickReplies(options) {
    const body = getEl('chatBody');
    const qrDiv = document.createElement('div');
    qrDiv.className = 'quick-replies';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'qr-btn';
        btn.textContent = opt;
        btn.onclick = () => {
            qrDiv.querySelectorAll('.qr-btn').forEach(b => b.disabled = true);
            qrDiv.style.opacity = '0.5';

            // Encerramentos
            if (/agendei|obrigado|obrigad|tchau|flw/i.test(opt)) {
                appendUserMsg(opt);
                appendBotMsg(`De nada! 😊 Qualquer dúvida sobre ar-condicionado, é só chamar. Bom atendimento!`);
                return;
            }

            // Abrir Calendly
            if (/Calendly|Agendar|Ver datas|visita/i.test(opt)) {
                appendUserMsg(opt);
                appendBotMsg('Abrindo o agendamento online... 📅');
                setTimeout(() => abrirCalendly(), 600);
                return;
            }

            // Abrir WhatsApp
            if (/WhatsApp/i.test(opt)) {
                appendUserMsg(opt);
                appendBotMsg('Encaminhando para o WhatsApp... 📱');
                setTimeout(() => window.open(`https://wa.me/${CONFIG.WHATSAPP_NUM}?text=${encodeURIComponent(buildWhatsAppMsg())}`, '_blank'), 600);
                return;
            }

            // Emergência
            if (/parou agora|Emergência|Urgente/i.test(opt)) {
                appendUserMsg(opt);
                appendBotMsg(`🚨 **Entendido! Caso de emergência.**\n\nEstou te direcionando para o WhatsApp com **prioridade máxima**. Nossa equipe responde em minutos!`);
                setTimeout(() => {
                    const emergMsg = encodeURIComponent('🚨 URGENTE — Meu aparelho de ar-condicionado parou de funcionar e preciso de atendimento imediato! Vim pelo site renostter.com');
                    window.open(`https://wa.me/${CONFIG.WHATSAPP_NUM}?text=${emergMsg}`, '_blank');
                }, 1000);
                return;
            }

            appendUserMsg(opt);
            processarMensagem(opt);
        };
        qrDiv.appendChild(btn);
    });

    body.appendChild(qrDiv);
    scrollBottom();
}

function scrollBottom() {
    const body = getEl('chatBody');
    if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 50);
}

function showTyping() {
    const body = getEl('chatBody');
    if (getEl('typingIndicator')) return;
    const div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.id = 'typingIndicator';
    div.innerHTML = `
    <div class="chat-avatar"><img src="assets/lucas-ai.jpg" alt="Lucas"></div>
    <div class="chat-bubble typing-bubble"><span></span><span></span><span></span></div>`;
    body.appendChild(div);
    scrollBottom();
}

function hideTyping() {
    getEl('typingIndicator')?.remove();
}

/* ═══════════════════════════════════════════════════════════
   📅  CALENDLY
   ═══════════════════════════════════════════════════════════ */
function abrirCalendly(url) {
    const target = url || CONFIG.CALENDLY_URL;
    if (typeof Calendly !== 'undefined') {
        Calendly.initPopupWidget({ url: target });
    } else {
        window.open(target, '_blank');
    }

    setTimeout(() => {
        appendBotMsg(`Conseguiu agendar? ✅ Se preferir confirmar pelo WhatsApp, é só clicar abaixo.`);
        appendQuickReplies(['📱 Confirmar pelo WhatsApp', '✅ Já agendei, obrigado!']);
    }, 5000);
}

/* ═══════════════════════════════════════════════════════════
   🔘  TOGGLE & CONTROLES
   ═══════════════════════════════════════════════════════════ */
function toggleChat() {
    isOpen = !isOpen;
    const widget = getEl('chatWidget');
    const btn    = getEl('chatToggleBtn');

    if (isOpen) {
        widget.classList.add('open');
        btn.classList.add('active');
        getEl('chatBadge')?.remove();
        getEl('chatWelcomePopup')?.classList.remove('visible');
        try { sessionStorage.setItem('rn_chat_opened', '1'); } catch {}

        if (conversationHistory.length === 0) {
            loadHistoryFromSession();
        }
        if (conversationHistory.length === 0) {
            setTimeout(() => initChat(), 400);
        } else {
            /* Restaura mensagens da sessão no DOM se o chat foi reaberto */
            setTimeout(() => scrollBottom(), 100);
        }
    } else {
        widget.classList.remove('open');
        btn.classList.remove('active');
    }
}

function closeChat() {
    isOpen = false;
    getEl('chatWidget')?.classList.remove('open');
    getEl('chatToggleBtn')?.classList.remove('active');
}

async function initChat() {
    if (initInProgress) return;
    initInProgress = true;

    const useProxy  = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO');
    const useDirect = !useProxy && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.length > 10;
    const keyOk     = useProxy || useDirect;

    if (keyOk) {
        showTyping();
        try {
            const raw = await callGemini('__init__: cumprimente o cliente brevemente como Lucas e apresente as principais formas de ajuda disponíveis (instalação, manutenção, higienização, dúvidas técnicas, orçamentos). Ofereça quick replies.');
            hideTyping();
            const { displayText, actions } = parseAIResponse(raw);
            if (displayText) appendBotMsg(displayText);
            const qr = executeActions(actions);
            if (qr.length) appendQuickReplies(qr);
        } catch {
            hideTyping();
            showFallbackWelcome();
        }
    } else {
        showFallbackWelcome();
    }

    initInProgress = false;
}

function showFallbackWelcome() {
    appendBotMsg(`Olá! 👋 Sou o **Lucas**, especialista em climatização da **Renostter**! 🤖\n\nPosso te ajudar com instalação, manutenção, higienização, PMOC e qualquer dúvida técnica sobre ar-condicionado em SP.\n\n**Como posso te ajudar hoje?**`);
    appendQuickReplies(['🚨 Meu aparelho parou!', '🔧 Instalação de Split', '✨ Higienização', '🔍 Manutenção Preventiva', '💨 Problema de gás', '❓ Calcular BTU', '📋 PMOC Empresarial', '💰 Tabela de preços']);
}

/* ═══════════════════════════════════════════════════════════
   ⌨️  INPUT
   ═══════════════════════════════════════════════════════════ */
function sendChatMessage() {
    const input = getEl('chatInput');
    const texto = input?.value?.trim();
    if (!texto || isLoading) return;
    input.value = '';
    appendUserMsg(texto);
    processarMensagem(texto);
}

/* ═══════════════════════════════════════════════════════════
   🚀  DOMContentLoaded
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    const _input = getEl('chatInput');
    if (_input && !_input._keyListenerAdded) {
        _input._keyListenerAdded = true;
        _input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    const jaAbriu = () => { try { return !!sessionStorage.getItem('rn_chat_opened'); } catch { return false; } };

    /* Badge após 5s — apenas se o chat nunca foi aberto nesta sessão */
    setTimeout(() => {
        if (!isOpen && !jaAbriu()) {
            const btn = getEl('chatToggleBtn');
            if (btn && !getEl('chatBadge')) {
                const badge = document.createElement('div');
                badge.id = 'chatBadge';
                badge.className = 'chat-badge';
                badge.textContent = '1';
                btn.appendChild(badge);
            }
        }
    }, 5000);

    /* Popup após 10s — apenas uma vez por sessão */
    setTimeout(() => {
        if (!isOpen && !jaAbriu()) {
            const popup = getEl('chatWelcomePopup');
            if (popup) {
                popup.classList.add('visible');
                setTimeout(() => popup.classList.remove('visible'), 7000);
            }
        }
    }, 10000);
});
