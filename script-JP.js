/* ============================
   RENOSTTER — SCRIPT.JS
   ============================ */

// ─── NAVBAR SCROLL ───────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ─── HAMBURGER MENU ──────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const spans = hamburger.querySelectorAll('span');
    if (navLinks.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
    }
});

// Fechar menu ao clicar em link
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        hamburger.querySelectorAll('span').forEach(s => {
            s.style.transform = '';
            s.style.opacity = '';
        });
    });
});

// ─── SCROLL SUAVE ────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});

// ─── CONTADOR ANIMADO ────────────────────────────────────
function animateCounter(el, target, duration = 1800) {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
        start += step;
        if (start >= target) {
            el.textContent = target.toLocaleString('pt-BR');
            clearInterval(timer);
        } else {
            el.textContent = Math.floor(start).toLocaleString('pt-BR');
        }
    }, 16);
}

// ─── INTERSECTION OBSERVER ───────────────────────────────
const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
};

// Fade-in para cards
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible', 'active');
            fadeObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.servico-card, .numero-card, .contato-card, .diferenciais-list li, .portfolio-card').forEach((el, index) => {
    el.classList.add('fade-up');
    el.style.transitionDelay = `${(index % 4) * 0.1}s`;
    fadeObserver.observe(el);
});

// Reveal Text Animado
const textRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            textRevealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

// We manually trigger any text that has .reveal-text
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.reveal-text').forEach((el, index) => {
        // Add a slight stagger for multi-line titles if needed
        el.style.transitionDelay = `${index * 0.05}s`;
        textRevealObserver.observe(el);
    });
});


// Contadores
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counters = entry.target.querySelectorAll('.counter');
            counters.forEach(counter => {
                const target = parseInt(counter.getAttribute('data-target'));
                animateCounter(counter, target);
            });
            counterObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.3 });

const numerosSection = document.querySelector('.numeros');
if (numerosSection) counterObserver.observe(numerosSection);

// ─── STATUS DE ATENDIMENTO ───────────────────────────────
function checkOpenStatus() {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;

    const now = new Date();
    // Horário de Brasília (UTC-3)
    const day = now.getDay(); // 0 = domingo
    const hours = now.getHours();
    const mins = now.getMinutes();
    const time = hours * 60 + mins;

    // Seg–Sex: 09:00–18:00 | Sáb: 09:00–13:00
    const isWeekday = day >= 1 && day <= 5 && time >= 540 && time < 1080;
    const isSaturday = day === 6 && time >= 540 && time < 780;
    const isOpen = isWeekday || isSaturday;

    badge.textContent = isOpen ? '🟢 Aberto agora' : '🔴 Fechado no momento';
    badge.className = `status-badge ${isOpen ? 'open' : 'closed'}`;
}

checkOpenStatus();
setInterval(checkOpenStatus, 60000);

// ─── ACTIVE LINK NO SCROLL ───────────────────────────────
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 120;
        if (window.scrollY >= sectionTop) {
            current = section.getAttribute('id');
        }
    });

    document.querySelectorAll('.nav-links a:not(.btn-nav)').forEach(link => {
        link.classList.remove('active-link');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active-link');
        }
    });
});

// ─── PINTURA DE EQUIPAMENTO (SIMULADOR 3D/SVG) ───────────
function openPinturaModal() {
    const modal = document.getElementById('pinturaModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    // Disparar evento de visualização caso exista GTM/Analytics
    if (typeof gtag === 'function') {
        gtag('event', 'view_pintura_simulator', {
            'event_category': 'Pintura',
            'event_label': 'Open Modal'
        });
    }
}

function closePinturaModal() {
    const modal = document.getElementById('pinturaModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Global exposure for onClick handlers
window.openPinturaModal = openPinturaModal;
window.closePinturaModal = closePinturaModal;
window.applAcColor = function(colorHex, btnElement) {
    // 1. Change the SVG Fill safely using the CSS Variable hook
    const acBody = document.getElementById('acBodyPath');
    if (acBody) {
        acBody.setAttribute('fill', colorHex);
    }

    // 2. Change active state of swatches
    const swatches = document.querySelectorAll('.swatch');
    swatches.forEach(s => s.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    // 3. Show Promo Cupom (15% OFF) giving the user a surprise reward
    const promoBox = document.getElementById('pmPromoBox');
    if (promoBox) {
        promoBox.classList.remove('hidden');
    }
    
    if (typeof gtag === 'function') {
        gtag('event', 'select_color', {
            'event_category': 'Pintura',
            'event_label': colorHex
        });
    }
};

window.solicitarOrcamentoPintura = function() {
    if (typeof gtag === 'function') {
        gtag('event', 'solicitar_orcamento_pintura', {
            'event_category': 'Lead',
            'event_label': 'Pintura Personalizada'
        });
    }
    closePinturaModal();
    
    // Rola para a seção de contato ou abre o whatsapp direto com texto pré-preenchido
    const _waNum = (typeof CONFIG !== 'undefined' && CONFIG.WHATSAPP_NUM) ? CONFIG.WHATSAPP_NUM : '5511952730593';
    const waUrl = `https://wa.me/${_waNum}?text=Olá!%20Gostaria%20de%20usar%20meu%20desconto%20CORES15%20para%20pintura%20de%20ar-condicionado.`;
    window.open(waUrl, '_blank');
};

// ─── TRABALHE CONOSCO ─────────────────────────────────────────────────
const CAREERS_JOBS = [
    {
        id: 'tecnico-climatizacao',
        titulo: 'Técnico de Climatização',
        departamento: 'Operações',
        localizacao: 'São Paulo/SP',
        tipo_contrato: 'CLT ou PJ',
        faixa_salarial: 'A combinar',
        modalidade: 'Presencial',
        descricao: 'Atuação em instalação, manutenção preventiva/corretiva e higienização de sistemas de ar-condicionado.',
        requisitos: ['Experiência com split hi-wall', 'CNH desejável', 'Disponibilidade para atendimento em SP'],
        beneficios: ['Treinamento técnico', 'Possibilidade de crescimento', 'Ambiente colaborativo']
    },
    {
        id: 'auxiliar-tecnico',
        titulo: 'Auxiliar Técnico',
        departamento: 'Operações',
        localizacao: 'São Paulo/SP',
        tipo_contrato: 'CLT',
        faixa_salarial: 'A combinar',
        modalidade: 'Presencial',
        descricao: 'Apoio aos técnicos em campo, organização de ferramentas, preparação de materiais e atendimento ao cliente.',
        requisitos: ['Vontade de aprender', 'Organização', 'Pontualidade'],
        beneficios: ['Formação prática', 'Plano de evolução', 'Equipe experiente']
    }
];

function initCareersModal() {
    const modal = document.getElementById('careersModal');
    const form = document.getElementById('careersForm');
    const jobList = document.getElementById('careersJobList');
    const select = document.getElementById('careersVagaSelect');
    const feedback = document.getElementById('careersFeedback');
    if (!modal || !form || !jobList || !select || !feedback) return;

    const switchTab = tab => {
        document.querySelectorAll('.careers-tab').forEach(btn => {
            const active = btn.dataset.careersTab === tab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.getElementById('careersPanelVagas')?.classList.toggle('active', tab === 'vagas');
        document.getElementById('careersPanelCandidatura')?.classList.toggle('active', tab === 'candidatura');
    };

    const openModal = () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    jobList.innerHTML = CAREERS_JOBS.map(job => `
        <article class="careers-job-card">
            <div class="careers-job-top">
                <div>
                    <h3>${job.titulo}</h3>
                    <p class="careers-job-meta">${job.departamento} · ${job.localizacao} · ${job.tipo_contrato} · ${job.modalidade}</p>
                </div>
                <span class="careers-job-badge">${job.faixa_salarial}</span>
            </div>
            <p class="careers-job-desc">${job.descricao}</p>
            <p class="careers-job-list-small"><strong>Requisitos:</strong> ${job.requisitos.join(', ')}</p>
            <p class="careers-job-list-small"><strong>Benefícios:</strong> ${job.beneficios.join(', ')}</p>
            <button type="button" class="careers-apply-btn" data-careers-apply="${job.id}">Candidatar-se</button>
        </article>
    `).join('');

    select.innerHTML = CAREERS_JOBS.map(job => `<option value="${job.id}">${job.titulo}</option>`).join('');

    document.querySelectorAll('[data-careers-open]').forEach(btn => btn.addEventListener('click', openModal));
    document.querySelectorAll('[data-careers-close]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelectorAll('[data-careers-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.careersTab)));
    jobList.addEventListener('click', event => {
        const btn = event.target.closest('[data-careers-apply]');
        if (!btn) return;
        select.value = btn.dataset.careersApply;
        switchTab('candidatura');
    });
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const file = form.curriculo.files?.[0];
        if (file && file.size > 10 * 1024 * 1024) {
            feedback.textContent = 'O currículo deve ter no máximo 10MB.';
            feedback.className = 'careers-feedback fail';
            return;
        }

        const data = Object.fromEntries(new FormData(form).entries());
        const job = CAREERS_JOBS.find(item => item.id === data.vaga_id);
        feedback.textContent = 'Preparando envio...';
        feedback.className = 'careers-feedback';

        if (window.RENOSTTER_CAREERS_ENDPOINT) {
            try {
                const payload = new FormData(form);
                await fetch(window.RENOSTTER_CAREERS_ENDPOINT, { method: 'POST', body: payload });
                feedback.textContent = 'Candidatura enviada com sucesso. Boa sorte!';
                feedback.className = 'careers-feedback ok';
                form.reset();
                return;
            } catch {
                feedback.textContent = 'Não foi possível enviar automaticamente. Abrindo contato alternativo.';
                feedback.className = 'careers-feedback fail';
            }
        }

        const msg = `Olá! Quero enviar minha candidatura para ${job?.titulo || 'uma vaga'} na Renostter. Nome: ${data.nome_completo}. E-mail: ${data.email}. Celular: ${data.celular}.`;
        window.open(`https://wa.me/5511952730593?text=${encodeURIComponent(msg)}`, '_blank');
        feedback.textContent = 'Abrimos o WhatsApp para concluir o envio sem custo. Anexe seu currículo na conversa.';
        feedback.className = 'careers-feedback ok';
    });
}

document.addEventListener('DOMContentLoaded', initCareersModal);
