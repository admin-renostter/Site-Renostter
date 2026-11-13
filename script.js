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
/* ════════════════════════════════════════════════════════════════════
   CONTEUDO QUE SE DATA SOZINHO
   Nada aqui e escrito a mao: ano e tempo de casa saem da data atual,
   entao nunca envelhecem esperando alguem lembrar de atualizar.
   ════════════════════════════════════════════════════════════════════ */
/* Abertura da empresa: 18 de setembro de 2018 (mes 8 = setembro no JS) */
const DATA_FUNDACAO = new Date(2018, 8, 18);

/* Anos COMPLETOS, nao a diferenca de anos: antes de 18/09 o aniversario
   ainda nao aconteceu no ano corrente e o numero seria um a mais. */
function anosCompletosDesde(inicio, agora = new Date()) {
    let anos = agora.getFullYear() - inicio.getFullYear();
    const aniversario = new Date(agora.getFullYear(), inicio.getMonth(), inicio.getDate());
    if (agora < aniversario) anos -= 1;
    return Math.max(0, anos);
}

(function datarConteudo() {
    const anoAtual = new Date().getFullYear();

    const anoEl = document.getElementById('ano-atual');
    if (anoEl) anoEl.textContent = anoAtual;

    /* O contador de experiencia vinha com data-target="0" e exibia
       "0+ Anos de Experiencia" ao lado de "desde 2018". Agora e calculado. */
    const anos = anosCompletosDesde(DATA_FUNDACAO);
    document.querySelectorAll('#exp-counter, #exp-card').forEach(el => {
        el.setAttribute('data-target', String(anos));
    });

    /* O mesmo numero aparece no topo da pagina, em outro formato.
       Vinha fixo em "5 Anos" e contradizia a secao de numeros. */
    const heroEl = document.getElementById('exp-hero');
    if (heroEl) heroEl.textContent = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
})();

/* ════════════════════════════════════════════════════════════════════
   VIDEO DO TOPO — nao gastar dados de quem nao pediu
   Quem esta com economia de dados ligada, em conexao lenta ou pediu
   menos movimento fica so com o poster, que ja cobre a area inteira.
   ════════════════════════════════════════════════════════════════════ */
(function videoDeFundoLeve() {
    const video = document.querySelector('.hero-video');
    if (!video) return;

    const con = navigator.connection || {};
    const economizar = con.saveData === true
        || /(^|-)2g$/.test(con.effectiveType || '')
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!economizar) return;

    video.removeAttribute('autoplay');
    video.pause();
    video.querySelectorAll('source').forEach(s => s.remove());
    video.load(); /* aborta o download que ja possa ter comecado */
})();

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

    // Seg–Sáb: 09:00–18:00 (540 a 1080 minutos). Domingo fechado.
    const isWeekday = day >= 1 && day <= 5 && time >= 540 && time < 1080;
    const isSaturday = day === 6 && time >= 540 && time < 1080;
    const isOpen = isWeekday || isSaturday;

    badge.textContent = isOpen ? 'Aberto agora' : 'Fechado no momento';
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
/* Cor escolhida no visualizador 3D. Entra na mensagem do WhatsApp:
   um lead que ja diz a cor vale mais do que "quero um orcamento". */
let pinturaCorAtual = null;

/* Ponte chamada pelo modulo js/pintura-3d.js a cada cor selecionada. */
window.__pinturaCorEscolhida = function (nome, hex) {
    pinturaCorAtual = { nome, hex };
    document.getElementById('pmPromoBox')?.classList.remove('hidden');
    if (typeof gtag === 'function') {
        gtag('event', 'select_color', {
            'event_category': 'Pintura',
            'event_label': `${nome} ${hex}`
        });
    }
};

function openPinturaModal() {
    const modal = document.getElementById('pinturaModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /* O three.js (~700 KB) so e baixado aqui, na primeira abertura.
       Se o import falhar, o proprio modulo revela o simulador 2D. */
    import('./js/pintura-3d.js?v=20260902-visualizador3d')
        .then(m => m.abrirPintura3D())
        .catch(err => {
            console.warn('[Pintura] visualizador 3D indisponivel:', err);
            document.getElementById('p3dStage')?.classList.add('p3d-oculto');
            document.getElementById('p3dPanel')?.classList.add('p3d-oculto');
            document.getElementById('p3dFallback')?.classList.remove('p3d-oculto');
            document.getElementById('pmSwatches')?.classList.remove('p3d-oculto');
        });
    
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
    /* Para o loop de render: com o modal fechado a GPU ficaria
       desenhando um objeto invisivel e esquentando o celular. */
    import('./js/pintura-3d.js?v=20260902-visualizador3d')
        .then(m => m.fecharPintura3D())
        .catch(() => { /* nunca chegou a carregar */ });
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
    const _cor = pinturaCorAtual
        ? ` Escolhi a cor ${pinturaCorAtual.nome} (${pinturaCorAtual.hex.toUpperCase()}).`
        : '';
    const _msg = `Olá! Gostaria de usar meu desconto CORES15 para pintura de ar-condicionado.${_cor}`;
    const waUrl = `https://wa.me/${_waNum}?text=${encodeURIComponent(_msg)}`;
    window.open(waUrl, '_blank');
};
