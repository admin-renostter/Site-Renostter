/* ================================================
   RENOSTTER — CALENDAR.JS
   Integração Google Calendar + WhatsApp
   Email: comercial.renostter@gmail.com
   ================================================ */

const BUSINESS_EMAIL = 'comercial.renostter@gmail.com';
const WHATSAPP_NUM = '5511952730593';
const RENOSTTER_CAL_URL = 'https://cal.com/renostter-hbubv8/comercial-renostter?duration=90&overlayCalendar=true';

function abrirCalCom() {
    const configuredUrl = window.RENOSTTER_CONFIG?.calUrl || RENOSTTER_CAL_URL;
    const opened = window.open(configuredUrl, '_blank', 'noopener,noreferrer');

    if (!opened) {
        window.location.href = configuredUrl;
    }
}

document.addEventListener('click', event => {
    const trigger = event.target.closest('a[href="#agendar"], [data-open-calcom]');
    if (!trigger) return;

    event.preventDefault();
    abrirCalCom();
});

window.abrirCalCom = abrirCalCom;
window.abrirCalComModal = abrirCalCom;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Estado do formulário
const state = {
    servico: '',
    duracao: 2,
    data: '',
    hora: '',
    endereco: '',
    tipoLocal: '',
    nome: '',
    telefone: '',
    obs: ''
};

// ─── STEP 1: Seleção de Serviço ─────────────────────────────
document.querySelectorAll('input[name="servico"]').forEach(radio => {
    radio.addEventListener('change', function () {
        state.servico = this.value;
        state.duracao = parseInt(this.getAttribute('data-duration')) || 2;
        document.getElementById('next1').disabled = false;

        // Visual feedback
        document.querySelectorAll('.servico-opt-card').forEach(c => c.classList.remove('selected'));
        this.closest('.servico-option').querySelector('.servico-opt-card').classList.add('selected');
    });
});

// ─── STEP 2: Data e Hora ────────────────────────────────────
const dataInput = document.getElementById('data');
const horaSelect = document.getElementById('hora');
const enderecoInput = document.getElementById('endereco');
const tipoSelect = document.getElementById('tipo_local');

// Bloquear datas passadas e domingos
if (dataInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dataInput.min = `${yyyy}-${mm}-${dd}`;

    dataInput.addEventListener('change', () => {
        const selected = new Date(dataInput.value + 'T12:00:00');
        const dayOfWeek = selected.getDay(); // 0 = domingo, 6 = sábado

        if (dayOfWeek === 0) {
            dataInput.setCustomValidity('Não atendemos aos domingos. Por favor, selecione outro dia.');
            dataInput.reportValidity();
            dataInput.value = '';
            showDateError('Não atendemos aos domingos. Escolha de segunda a sábado.');
        } else if (dayOfWeek === 6 && selected.getHours() >= 13) {
            showDateError('Sábados até 13h. Selecione um horário pela manhã.');
        } else {
            dataInput.setCustomValidity('');
            clearDateError();
        }
    });
}

function showDateError(msg) {
    let el = document.getElementById('date-error-msg');
    if (!el) {
        el = document.createElement('p');
        el.id = 'date-error-msg';
        el.style.cssText = 'color:#ef4444;font-size:0.85rem;margin-top:6px;display:flex;align-items:center;gap:4px;';
        dataInput?.parentNode?.appendChild(el);
    }
    el.textContent = `⚠️ ${msg}`;
}

function clearDateError() {
    document.getElementById('date-error-msg')?.remove();
}

function checkStep2() {
    const dateVal = dataInput?.value;
    if (!dateVal) {
        const btn = document.getElementById('next2');
        if (btn) btn.disabled = true;
        return;
    }
    const selected   = new Date(dateVal + 'T12:00:00');
    const dayOfWeek  = selected.getDay();
    const hora       = horaSelect?.value || '';
    const horaNum    = hora ? parseInt(hora.split(':')[0], 10) : 0;

    const isSunday            = dayOfWeek === 0;
    const isSaturdayAfternoon = dayOfWeek === 6 && hora && horaNum >= 13;

    if (isSaturdayAfternoon) {
        showDateError('Sábados até 13h. Selecione um horário pela manhã.');
    }

    const validDate = !isSunday && !isSaturdayAfternoon;
    const ok = validDate && hora && enderecoInput?.value && tipoSelect?.value;
    const btn = document.getElementById('next2');
    if (btn) btn.disabled = !ok;
}

[dataInput, horaSelect, enderecoInput, tipoSelect].forEach(el => {
    if (el) el.addEventListener('change', () => {
        state.data = dataInput?.value || '';
        state.hora = horaSelect?.value || '';
        state.endereco = enderecoInput?.value || '';
        state.tipoLocal = tipoSelect?.value || '';
        checkStep2();
    });
});

// ─── INDICADOR DE VAGAS DISPONÍVEIS ─────────────────────────
(function renderSlotsIndicator() {
    const container = document.getElementById('slots-indicator');
    if (!container) return;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=dom, 6=sab

    // Calcular dias restantes na semana (seg-sab)
    const daysLeft = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;

    // Cada dia útil tem ~4 slots (09, 10, 13, 14, 15, 16h) → seg-sex = 6 slots, sáb = 2 slots
    const slotsPerWeekday = 6;
    const slotsSaturday = 2;
    const weekdaysLeft = Math.max(0, Math.min(daysLeft, 5));
    const saturdayLeft = daysLeft >= 6 ? 1 : 0;
    const totalSlots = weekdaysLeft * slotsPerWeekday + saturdayLeft * slotsSaturday;

    // Simular vagas já tomadas (seed baseado na semana do ano para consistência)
    const weekNum = Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 604800000);
    const taken = (weekNum * 7 + dayOfWeek) % Math.max(1, totalSlots - 2);
    const available = Math.max(1, totalSlots - taken);

    const urgency = available <= 3 ? 'urgente' : available <= 6 ? 'medio' : 'normal';
    const prefix = urgency === 'urgente' ? '🔴 Apenas ' : urgency === 'medio' ? '🟡 ' : '🟢 ';
    const suffix = urgency === 'urgente'
        ? ` vaga${available > 1 ? 's' : ''} esta semana!`
        : ' vagas disponíveis esta semana';

    const amount = document.createElement('strong');
    amount.textContent = String(available);
    container.replaceChildren(document.createTextNode(prefix), amount, document.createTextNode(suffix));
    container.className = `slots-indicator slots-${urgency}`;
})();

// ─── STEP 3: Dados do Cliente ────────────────────────────────
const nomeInput = document.getElementById('nome');
const telefoneInput = document.getElementById('telefone');
const obsInput = document.getElementById('observacoes');

function checkStep3() {
    const ok = nomeInput?.value?.trim() && telefoneInput?.value?.trim();
    if (document.getElementById('next3')) {
        document.getElementById('next3').disabled = !ok;
    }
}

[nomeInput, telefoneInput].forEach(el => {
    if (el) el.addEventListener('input', () => {
        state.nome = nomeInput?.value.trim() || '';
        state.telefone = telefoneInput?.value.trim() || '';
        state.obs = obsInput?.value.trim() || '';
        checkStep3();
    });
});

// ─── NAVEGAÇÃO ENTRE STEPS ───────────────────────────────────
function goStep(n) {
    // Salvar dados atuais antes de mudar
    state.data = dataInput?.value || state.data;
    state.hora = horaSelect?.value || state.hora;
    state.endereco = enderecoInput?.value || state.endereco;
    state.tipoLocal = tipoSelect?.value || state.tipoLocal;
    state.nome = nomeInput?.value.trim() || state.nome;
    state.telefone = telefoneInput?.value.trim() || state.telefone;
    state.obs = obsInput?.value.trim() || state.obs;

    // Esconder todos
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active', 'done'));

    // Mostrar step atual
    const target = document.getElementById(`form-step-${n}`);
    if (target) {
        target.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Atualizar indicadores
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        if (!dot) continue;
        if (i < n) dot.classList.add('done');
        if (i === n) dot.classList.add('active');
    }

    // Preencher resumo no step 4
    if (n === 4) buildResumo();
}

// ─── RESUMO DO AGENDAMENTO ───────────────────────────────────
function buildResumo() {
    const card = document.getElementById('resumoCard');
    if (!card) return;

    const dataFmt = state.data
        ? new Date(state.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
        : '–';

    card.innerHTML = `
    <div class="resumo-row"><span class="resumo-key">🔧 Serviço</span><span class="resumo-val">${escapeHtml(state.servico || '–')}</span></div>
    <div class="resumo-row"><span class="resumo-key">📅 Data</span><span class="resumo-val">${escapeHtml(dataFmt)}</span></div>
    <div class="resumo-row"><span class="resumo-key">🕐 Horário</span><span class="resumo-val">${escapeHtml(state.hora || '–')}h</span></div>
    <div class="resumo-row"><span class="resumo-key">📍 Endereço</span><span class="resumo-val">${escapeHtml(state.endereco || '–')}</span></div>
    <div class="resumo-row"><span class="resumo-key">🏠 Ambiente</span><span class="resumo-val">${escapeHtml(state.tipoLocal || '–')}</span></div>
    <div class="resumo-row"><span class="resumo-key">👤 Nome</span><span class="resumo-val">${escapeHtml(state.nome || '–')}</span></div>
    <div class="resumo-row"><span class="resumo-key">📱 WhatsApp</span><span class="resumo-val">${escapeHtml(state.telefone || '–')}</span></div>
    ${state.obs ? `<div class="resumo-row"><span class="resumo-key">💬 Obs.</span><span class="resumo-val">${escapeHtml(state.obs)}</span></div>` : ''}
  `;
}

// ─── GOOGLE CALENDAR — Confirmar Agendamento ─────────────────
function confirmarAgendamento() {
    if (!state.servico || !state.data || !state.hora) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    // Montar datas no formato YYYYMMDDTHHmmSSZ (local time)
    const [year, month, day] = state.data.split('-');
    const [startH, startM] = state.hora.split(':');
    const endH = parseInt(startH) + state.duracao;

    const dtStart = `${year}${month}${day}T${String(startH).padStart(2, '0')}${startM}00`;
    const dtEnd = `${year}${month}${day}T${String(endH).padStart(2, '0')}${startM}00`;

    const title = encodeURIComponent(`Renostter — ${state.servico} | ${state.nome}`);
    const details = encodeURIComponent(
        `🔧 Serviço: ${state.servico}\n` +
        `👤 Cliente: ${state.nome}\n` +
        `📱 Telefone: ${state.telefone}\n` +
        `🏠 Ambiente: ${state.tipoLocal}\n` +
        `⏱ Duração estimada: ${state.duracao}h\n` +
        (state.obs ? `\n💬 Observações: ${state.obs}` : '') +
        `\n\n🌐 Renostter Climatização\n📞 (11) 95273-0593\n✉ comercial.renostter@gmail.com`
    );
    const location = encodeURIComponent(state.endereco || 'São Paulo, SP');

    const calUrl =
        `https://calendar.google.com/calendar/render?action=TEMPLATE` +
        `&text=${title}` +
        `&dates=${dtStart}/${dtEnd}` +
        `&details=${details}` +
        `&location=${location}` +
        `&add=${encodeURIComponent(BUSINESS_EMAIL)}` +
        `&sf=true&output=xml`;

    // Abrir Google Calendar em nova aba
    window.open(calUrl, '_blank');

    // Mostrar tela de sucesso
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    const success = document.getElementById('form-step-success');
    if (success) {
        success.classList.add('active');
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Também notifica via WhatsApp automaticamente
    setTimeout(() => confirmarWhatsApp(true), 800);
}

// ─── WHATSAPP — Confirmar Agendamento ────────────────────────
function confirmarWhatsApp(silent = false) {
    if (!state.nome || !state.servico) {
        if (!silent) alert('Preencha todos os campos antes de confirmar.');
        return;
    }

    const msg = encodeURIComponent(
        `📅 *NOVO AGENDAMENTO — Renostter Site*\n\n` +
        `🔧 *Serviço:* ${state.servico}\n` +
        `👤 *Nome:* ${state.nome}\n` +
        `📱 *Telefone:* ${state.telefone}\n` +
        `📅 *Data:* ${state.data}\n` +
        `🕐 *Horário:* ${state.hora}h\n` +
        `📍 *Endereço:* ${state.endereco}\n` +
        `🏠 *Ambiente:* ${state.tipoLocal}\n` +
        (state.obs ? `💬 *Obs.:* ${state.obs}\n` : '') +
        `\n_Agendamento feito pelo site renostter.com_`
    );

    window.open(`https://wa.me/${WHATSAPP_NUM}?text=${msg}`, '_blank');
}

// ─── RESETAR FORMULÁRIO ───────────────────────────────────────
function resetForm() {
    Object.keys(state).forEach(k => { state[k] = k === 'duracao' ? 2 : ''; });
    document.querySelectorAll('input[name="servico"]').forEach(r => r.checked = false);
    document.querySelectorAll('.servico-opt-card').forEach(c => c.classList.remove('selected'));
    if (dataInput) dataInput.value = '';
    if (horaSelect) horaSelect.value = '';
    if (enderecoInput) enderecoInput.value = '';
    if (tipoSelect) tipoSelect.value = '';
    if (nomeInput) nomeInput.value = '';
    if (telefoneInput) telefoneInput.value = '';
    if (obsInput) obsInput.value = '';

    document.getElementById('next1').disabled = true;
    document.getElementById('next2').disabled = true;
    document.getElementById('next3').disabled = true;
    goStep(1);
}

// ─── PORTFOLIO FILTROS ────────────────────────────────────────
document.querySelectorAll('.ptab').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        const filter = this.getAttribute('data-filter');
        document.querySelectorAll('.portfolio-item').forEach(item => {
            const cat = item.getAttribute('data-cat');
            if (filter === 'all' || cat === filter) {
                item.style.display = '';
                item.style.animation = 'fadeInUp 0.4s ease both';
            } else {
                item.style.display = 'none';
            }
        });
    });
});
