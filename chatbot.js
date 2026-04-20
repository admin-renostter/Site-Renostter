/* =============================================================
   RENOSTTER — RITA IA SDR v2.0
   Motor: Google Gemini 2.0 Flash
   Persona: SDR especialista em climatização
   Ações estruturadas: Calendly • WhatsApp • Lead Capture
   ============================================================= */

/* ═══════════════════════════════════════════════════════════
   ⚙️  CONFIGURAÇÃO — edite apenas esta seção
   ═══════════════════════════════════════════════════════════ */
const CONFIG = {
    // ─── Proxy (recomendado — chave fica no servidor) ───────────
    // Após fazer deploy do Worker, cole a URL aqui e apague a chave direta:
    PROXY_URL: 'https://renostter-gemini.SEU_USUARIO.workers.dev',

    // ─── Direto (temporário — remove quando o proxy estiver no ar) ─
    GEMINI_API_KEY: '',   // ← deixe vazio após ativar o proxy
    GEMINI_MODEL: 'gemini-2.0-flash',

    // ─── Negócio ────────────────────────────────────────────────
    CALENDLY_URL: 'https://calendly.com/renostter/visita-tecnica',
    WHATSAPP_NUM: '5511952730593',
    BOT_NAME: 'Lucas',
};

/* ═══════════════════════════════════════════════════════════
   🧠  SYSTEM PROMPT — Persona SDR Rita
   ═══════════════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `
Você é LUCAS, assistente de vendas (SDR) da Renostter Climatização — empresa especializada em ar-condicionado em São Paulo/SP.

## SUA PERSONALIDADE
- Comunicativo, caloroso e profissional. Usa emojis com moderação.
- Fala em português brasileiro informal (mas não vulgar).
- Confiante, proativo e focado em converter a conversa em agendamento.
- Usa técnicas de SPIN Selling: descobre Situação → Problema → Implicação → Necessidade.
- Use sempre o gênero masculino ao se referir a si mesmo (ex: "sou o Lucas", "estou disponível", "obrigado").

## EMPRESA: RENOSTTER CLIMATIZAÇÃO
- 📍 São Paulo e Grande SP
- 📞 (11) 95273-0593 | comercial.renostter@gmail.com
- 📸 @renostter | 🌐 renostter.com
- 🕐 Seg–Sex 09h–18h | Sáb 09h–13h
- ⭐ +5 anos de experiência | +4.500 instalações realizadas

## SERVIÇOS E PREÇOS (use estes valores)
| Serviço | Preço inicial | Duração |
|---------|-------------|---------|
| Instalação Split | R$ 280 | 3h |
| Manutenção Preventiva | R$ 150 | 2h |
| Manutenção Corretiva | a partir de R$ 200 (diagnóstico grátis) | 2-4h |
| Higienização Completa | R$ 120/aparelho | 1,5h |
| Recarga de Gás R-410A | R$ 180 | 1h |
| PMOC (empresa) | sob consulta | - |
| Remoção + Reinstalação | R$ 200 | 3h |
| Contratos de Manutenção | R$ 90/mês (mín. 6 meses) | - |

## NORMAS TÉCNICAS (use quando relevante)
- PMOC obrigatório: Portaria 3.523/MS + RDC 09/ANVISA
- Garantia de serviços: 90 dias (CDC Art. 26)
- Garantia de peças: até 12 meses
- Fluidos: R-22, R-410A, R-32, R-404A
- Normas: ABNT NBR 16.401 / NBR 14679

## SEU OBJETIVO SDR
1. Cumprimentar e criar rapport
2. Descobrir NOME do cliente
3. Identificar SERVIÇO necessário
4. Qualificar: RESIDENCIAL ou EMPRESARIAL
5. Avaliar URGÊNCIA (urgente / pode agendar / só orçamento)
6. Superar objeções de preço/tempo com argumentos de valor
7. CONVERTER: oferecer agendamento via Calendly OU WhatsApp

## OBJEÇÕES COMUNS
- "Caro": "Nosso orçamento é gratuito! Depois de ver o problema exato, podem existir valores menores. E com a manutenção preventiva você economiza até 30% de energia e evita trocas de peças caras."
- "Vou pensar": "Claro! Mas se o aparelho parou de resfriar bem, cada dia que passa pode piorar o problema. Deixa eu ao menos garantir uma data na agenda para você?"
- "Tenho outro orçamento": "Ótimo! Compare bem os serviços incluídos — nós emitimos laudo técnico e garantia oficial. Qual o valor que você recebeu?"
- "Só quero o preço": "Para um preço exato preciso saber o modelo do aparelho. Mas posso te dar uma estimativa agora!"
- Urgência real (aparelho parado): Priorizar atendimento, mencionar que temos técnicos disponíveis.

## AÇÕES DISPONÍVEIS
Quando quiser executar uma ação especial, inclua um bloco JSON no final da resposta (após o texto normal):

Para abrir Calendly: {"action":"calendly"}
Para abrir WhatsApp: {"action":"whatsapp","msg":"[mensagem pré-redigida]"}  
Para mostrar quick replies: {"action":"quickreplies","options":["Op1","Op2","Op3"]}
Para capturar lead qualificado: {"action":"lead","nome":"X","servico":"X","tipo":"X","urgencia":"X"}

IMPORTANTE:
- Combine ações: ex. texto → {"action":"lead",...} → {"action":"quickreplies",...}
- O JSON é processado pelo sistema, o cliente NÃO vê
- Máximo 1 ação "calendly" ou "whatsapp" por mensagem
- Nunca simule uma conversa ou finja ser o cliente
- Se o cliente digitar em outro idioma, responda em português do Brasil
- Mantenha as respostas CURTAS (máx 4 parágrafos)
- Lembre-se: você é o LUCAS, seja sempre educado e diga "obrigado".
`;

/* ═══════════════════════════════════════════════════════════
   📦  ESTADO GLOBAL
   ═══════════════════════════════════════════════════════════ */
let conversationHistory = [];   // {role:'user'|'model', parts:[{text}]}
let leadData = {};              // nome, servico, tipo, urgencia
let isOpen = false;
let isLoading = false;

/* ═══════════════════════════════════════════════════════════
   🌐  GEMINI API
   ═══════════════════════════════════════════════════════════ */
async function callGemini(userMessage) {
    // Qual endpoint usar?
    const useProxy = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO');
    const useDirect = !useProxy && CONFIG.GEMINI_API_KEY;

    if (!useProxy && !useDirect) throw new Error('Configure PROXY_URL ou GEMINI_API_KEY em CONFIG.');

    const endpoint = useProxy
        ? CONFIG.PROXY_URL
        : `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

    // Adicionar mensagem ao histórico
    conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    const body = {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: conversationHistory,
        generationConfig: { temperature: 0.75, topP: 0.95, maxOutputTokens: 512 },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
    };

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const fullText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
    return fullText;
}

/* ═══════════════════════════════════════════════════════════
   🔧  PARSER DE AÇÕES
   ═══════════════════════════════════════════════════════════ */
function parseAIResponse(rawText) {
    const actions = [];
    let displayText = rawText;

    // Extrair todos os blocos JSON da resposta
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
   ⚡  EXECUTOR DE AÇÕES
   ═══════════════════════════════════════════════════════════ */
function executeActions(actions) {
    const quickReplies = [];

    for (const act of actions) {
        switch (act.action) {

            case 'lead':
                if (act.nome) leadData.nome = act.nome;
                if (act.servico) leadData.servico = act.servico;
                if (act.tipo) leadData.tipo = act.tipo;
                if (act.urgencia) leadData.urgencia = act.urgencia;
                console.log('[Rita SDR] Lead capturado:', leadData);
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

    try {
        // IA ativa se: proxy configurado OU chave direta configurada
        const useProxy = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('SEU_USUARIO');
        const useDirect = !useProxy && CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.length > 10;
        const keyOk = useProxy || useDirect;

        let displayText, actions;

        if (keyOk) {
            showTyping();
            const raw = await callGemini(texto);
            hideTyping();
            ({ displayText, actions } = parseAIResponse(raw));
        } else {
            // Fallback rule-based simplificado
            await new Promise(r => setTimeout(r, 600));
            ({ displayText, actions } = fallbackResponse(texto));
        }

        // Renderizar mensagem da Rita
        if (displayText) appendBotMsg(displayText);

        // Executar ações e coletar quick replies
        const qrOptions = executeActions(actions);
        if (qrOptions.length > 0) appendQuickReplies(qrOptions);

    } catch (err) {
        hideTyping();
        console.error('[Rita] Erro Gemini:', err);
        appendBotMsg(`Ops, tive uma instabilidade! 😅 Por favor, fale diretamente via WhatsApp ou tente novamente.`);
        appendQuickReplies(['📱 Chamar no WhatsApp', '🔄 Tentar novamente']);
    } finally {
        isLoading = false;
    }
}

/* ═══════════════════════════════════════════════════════════
   🔄  FALLBACK (sem API key configurada)
   ═══════════════════════════════════════════════════════════ */
function fallbackResponse(texto) {
    const t = texto.toLowerCase();

    const checks = [
        { kw: ['instalação', 'instalacao', 'instalar'], resp: `Ótimo! A **instalação** na Renostter inclui:\n• Split, Cassete, Piso-Teto, VRF\n• Laudo técnico + garantia de 90 dias\n• A partir de **R$\u00a0280**\n\nPara um orçamento preciso, agende uma visita gratuitamente! 😊`, qr: ['📅 Agendar visita', '📱 Falar no WhatsApp'] },
        { kw: ['higienização', 'higienizacao', 'limpeza'], resp: `A **higienização** remove fungos, bactérias e odores do seu ar-condicionado. Essencial para a saúde!\n🔹 A partir de **R$\u00a0120/aparelho**\n🔹 Processo profissional com bactericida\n\nAgende agora — fazemos na sua casa ou empresa! ✨`, qr: ['📅 Agendar higienização', '📱 Chamar no WhatsApp'] },
        { kw: ['manutenção', 'manutencao', 'preventiva'], resp: `A **manutenção preventiva** prolonga a vida do equipamento e economiza até **30%** de energia!\n🔹 A partir de **R$\u00a0150**\n🔹 Com laudo técnico e relatório\n\nQuer agendar para a sua casa ou empresa?`, qr: ['🏠 Residencial', '🏢 Empresarial'] },
        { kw: ['pmoc'], resp: `O **CONTRATO DE MANUTENÇÃO - PMOC** é obrigatório por lei para clínicas, condomínios e empresas!\n✅ Emitimos toda documentação ANVISA\n✅ Normas ABNT NBR 16.401\n\nMe fala o tipo de ambiente e quantos aparelhos para passar o orçamento!`, qr: ['📱 Pedir orçamento PMOC', '📅 Agendar visita'] },
        { kw: ['gás', 'gas', 'resfria', 'gelando'], resp: `Se o aparelho **não está resfriando**, provavelmente é falta de gás ou um vazamento.\n\n💨 Recarga a partir de **R$\u00a0180** (diagnóstico incluso)\n\nVamos agendar uma visita técnica para avaliar?`, qr: ['📅 Agendar diagnóstico', '📱 WhatsApp urgente'] },
        { kw: ['preço', 'preco', 'valor', 'quanto', 'custo'], resp: `**Tabela de referência Renostter:**\n• Higienização: a partir de R$\u00a0120\n• Manutenção: a partir de R$\u00a0150\n• Instalação: a partir de R$\u00a0280\n• Diagnóstico + Recarga de gás: a partir de R$\u00a0180\n\nO preço exato depende do modelo e da situação. Quer um orçamento gratuito? 📋`, qr: ['📅 Orçamento grátis', '📱 Chamar agora'] },
        { kw: ['urgente', 'parou', 'quebrou', 'não liga'], resp: `🚨 **Caso urgente — estamos aqui!**\n\nMe diga seu nome e localização e direcionamos um técnico o mais rápido possível. Para atendimento imediato, chame diretamente pelo WhatsApp!`, qr: ['📱 WhatsApp urgente', '📅 Agendar agora'] },
        { kw: ['garantia', 'laudo', 'certificado'], resp: `A Renostter emite:\n✅ **Laudo técnico** para todos os serviços\n✅ **90 dias** de garantia (CDC)\n✅ **Até 12 meses** em peças\n✅ **PMOC** conforme ABNT e ANVISA\n\nTudo documentado e registrado!`, qr: ['📅 Agendar visita', '📱 Falar com especialista'] },
        { kw: ['agendar', 'agenda', 'data', 'horário', 'calendly'], resp: `Ótimo! Abrindo nosso agendamento online agora... 📅`, qr: ['📅 Abrir Calendly'], actions: [{ action: 'calendly' }] },
        { kw: ['whatsapp', 'zap', 'ligar'], resp: `Vou te encaminhar ao WhatsApp! Nossa equipe responde rapidinho. 📱`, actions: [{ action: 'whatsapp', msg: buildWhatsAppMsg() }] },
    ];

    for (const check of checks) {
        if (check.kw.some(k => t.includes(k))) {
            return {
                displayText: check.resp,
                actions: [
                    ...(check.actions || []),
                    ...(check.qr ? [{ action: 'quickreplies', options: check.qr }] : [])
                ]
            };
        }
    }

    // Default
    return {
        displayText: `Olá! Sou o **Lucas**, assistente da Renostter Climatização. 😊\n\nPosso te ajudar com instalação, manutenção, higienização e CONTRATO DE MANUTENÇÃO - PMOC de ar-condicionado em SP.\n\n**Como posso te ajudar hoje?**`,
        actions: [{ action: 'quickreplies', options: ['🔧 Instalação', '✨ Higienização', '🔍 Manutenção', '💨 Gás / Diagnóstico', '📋 CONTRATO DE MANUTENÇÃO - PMOC', '💰 Preços'] }]
    };
}

function buildWhatsAppMsg() {
    const { nome, servico, tipo } = leadData;
    return `Olá! ${nome ? `Me chamo *${nome}*. ` : ''}${servico ? `Preciso de *${servico}*` : 'Gostaria de um orçamento'}${tipo ? ` (${tipo})` : ''}. Vi o site da Renostter!`;
}

/* ═══════════════════════════════════════════════════════════
   🎨  RENDERIZAÇÃO
   ═══════════════════════════════════════════════════════════ */
function getEl(id) { return document.getElementById(id); }

function formatText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n• /g, '<br>• ')
        .replace(/\n🔹/g, '<br>🔹')
        .replace(/\n✅/g, '<br>✅')
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

            // Ações especiais sem precisar de IA
            if (opt.includes('Calendly') || opt.includes('Agendar')) {
                appendUserMsg(opt);
                appendBotMsg('Abrindo o agendamento online... 📅');
                setTimeout(() => abrirCalendly(), 600);
                return;
            }
            if (opt.includes('WhatsApp')) {
                appendUserMsg(opt);
                appendBotMsg('Encaminhando para o WhatsApp... 📱');
                setTimeout(() => window.open(`https://wa.me/${CONFIG.WHATSAPP_NUM}?text=${encodeURIComponent(buildWhatsAppMsg())}`, '_blank'), 600);
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

    /* Acompanhamento pós-abertura */
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
    const btn = getEl('chatToggleBtn');

    if (isOpen) {
        widget.classList.add('open');
        btn.classList.add('active');
        getEl('chatBadge')?.remove();
        getEl('chatWelcomePopup')?.classList.remove('visible');

        if (conversationHistory.length === 0) {
            setTimeout(() => initChat(), 400);
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
    const keyOk = CONFIG.GEMINI_API_KEY && !CONFIG.GEMINI_API_KEY.includes('COLE_SUA_CHAVE');

    if (keyOk) {
        // Primeira mensagem via IA
        showTyping();
        try {
            const raw = await callGemini('__init__: cumprimente o cliente e inicie o fluxo SDR');
            hideTyping();
            const { displayText, actions } = parseAIResponse(raw);
            if (displayText) appendBotMsg(displayText);
            const qr = executeActions(actions);
            if (qr.length) appendQuickReplies(qr);
        } catch {
            hideTyping();
            appendBotMsg(`Olá! 👋 Sou a **Rita**, assistente da Renostter Climatização!\n\nComo posso te ajudar hoje?`);
            appendQuickReplies(['🔧 Instalação', '✨ Higienização', '🔍 Manutenção', '💨 Recarga de Gás', '📋 CONTRATO DE MANUTENÇÃO - PMOC', '💰 Ver preços']);
        }
    } else {
        // Fallback bonito quando não tem chave
        appendBotMsg(`Olá! 👋 Sou o **Lucas**, assistente de vendas da **Renostter Climatização**! 🤖\n\nSou especialista em climatização e posso te ajudar com orçamentos, informações técnicas e agendamentos.\n\n**O que você precisa hoje?**`);
        appendQuickReplies(['🔧 Instalação de Split', '✨ Higienização', '🔍 Manutenção Preventiva', '💨 Diagnóstico de Gás', '📋 CONTRATO DE MANUTENÇÃO - PMOC Empresarial', '💰 Tabela de preços']);
    }
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
    /* Enter para enviar */
    getEl('chatInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    /* Badge após 5s */
    setTimeout(() => {
        if (!isOpen) {
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

    /* Popup após 10s */
    setTimeout(() => {
        if (!isOpen) {
            const popup = getEl('chatWelcomePopup');
            if (popup) {
                popup.classList.add('visible');
                setTimeout(() => popup.classList.remove('visible'), 7000);
            }
        }
    }, 10000);
});
