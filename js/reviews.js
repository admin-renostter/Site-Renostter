/* ================================================
   RENOSTTER — REVIEWS.JS  v2
   Google Places via proxy · cache 12h · fallback estático
   ================================================ */

const REVIEWS_PROXY = 'https://renostter-gemini-proxy.adminrenostter.workers.dev';
const PLACE_ID      = 'ChIJZX-bcVRjzpQRIvN6uq9QL-k';
const MAPS_PROFILE  = `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`;
const REVIEW_WRITE  = 'https://g.page/r/CW0qmJKGFkgNEBI/review';  /* URL real */
const CACHE_KEY     = 'rn_reviews_v2';
const CACHE_TTL     = 12 * 60 * 60 * 1000; /* 12 horas */

/* ─── Ícone G do Google ─── */
const GOOGLE_ICON = `<svg class="review-google-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

/* ─── HTML dos botões de ação que aparece em TODOS os cards ─── */
function cardActionsHtml(reviewUrl) {
    /* reviewUrl: link para a avaliação específica (ou perfil geral) */
    return `
    <div class="review-actions">
        <a href="${reviewUrl}"
           target="_blank" rel="noopener noreferrer"
           class="review-ver-google"
           aria-label="Ver avaliação no Google">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"/>
                <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
            </svg>
            Ver no Google
        </a>
        <a href="${REVIEW_WRITE}"
           target="_blank" rel="noopener noreferrer"
           class="review-responder"
           aria-label="Deixar uma resposta no Google">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            </svg>
            Responder
        </a>
    </div>`;
}

const AVATAR_PALETTE = [
    'linear-gradient(135deg,#00AEEF,#0088CC)',
    'linear-gradient(135deg,#FF6B00,#E55A00)',
    'linear-gradient(135deg,#8B5CF6,#6D28D9)',
    'linear-gradient(135deg,#10B981,#059669)',
    'linear-gradient(135deg,#F59E0B,#D97706)',
    'linear-gradient(135deg,#EF4444,#DC2626)',
];

function starsHtml(n) {
    const full = Math.min(5, Math.max(0, Math.round(n)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function initials(name) {
    return (name || 'U').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function ptDate(unixSec) {
    if (!unixSec) return '';
    return new Date(unixSec * 1000).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

/* ─── Renderiza avaliações dinâmicas (vindas da API) ─── */
function renderReviews(result) {
    const grid = document.getElementById('reviews-grid-container');
    if (!grid) return;

    /* Atualiza badge + título com dados reais */
    const { rating, user_ratings_total: total } = result;
    if (rating) {
        const fmt = rating.toFixed(1).replace('.', ',');
        const avgEl   = document.querySelector('.reviews-stars-avg');
        const countEl = document.querySelector('.google-badge-text span');
        const titleEl = document.querySelector('#reviews .section-title .reveal-text');
        if (avgEl)   avgEl.innerHTML  = `${fmt}<div class="stars-row">${starsHtml(rating)}</div>`;
        if (countEl && total) countEl.textContent = `${total.toLocaleString('pt-BR')} avaliações verificadas`;
        if (titleEl && total) titleEl.innerHTML   = `+${total.toLocaleString('pt-BR')} avaliações<br><span class="gradient-text">${fmt} ★ no Google</span>`;
    }

    /* Filtra ≥4 estrelas, máximo 6 cards */
    const reviews = (result.reviews || []).filter(r => r.rating >= 4).slice(0, 6);
    if (!reviews.length) {
        enhanceStaticCards(); /* mantém estáticos mas adiciona botões */
        return;
    }

    grid.innerHTML = reviews.map((r, i) => {
        const color = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
        const date  = r.relative_time_description || ptDate(r.time);
        const photo = r.profile_photo_url;
        const avatar = photo
            ? `<img src="${photo}" alt="${r.author_name}" class="review-avatar review-avatar-img" width="40" height="40" loading="lazy">`
            : `<div class="review-avatar" style="background:${color}" aria-hidden="true">${initials(r.author_name)}</div>`;

        /* URL do autor — link direto para o perfil do avaliador no Google Maps */
        const authorUrl = r.author_url || MAPS_PROFILE;

        return `
        <div class="review-card fade-up" data-enhanced="1">
            ${GOOGLE_ICON}
            <div class="review-top">
                ${avatar}
                <div class="review-info">
                    <a href="${authorUrl}" target="_blank" rel="noopener noreferrer" class="review-author-link">
                        <strong>${r.author_name}</strong>
                    </a>
                    <span>${date}</span>
                </div>
            </div>
            <div class="review-stars" aria-label="${r.rating} estrelas">${starsHtml(r.rating)}</div>
            <p class="review-text">${r.text || ''}</p>
            ${cardActionsHtml(authorUrl)}
        </div>`;
    }).join('');
}

/* ─── Injeta botões de ação nos cards estáticos do HTML ─── */
function enhanceStaticCards() {
    document.querySelectorAll('#reviews-grid-container .review-card:not([data-enhanced])').forEach(card => {
        card.setAttribute('data-enhanced', '1');
        card.insertAdjacentHTML('beforeend', cardActionsHtml(MAPS_PROFILE));
    });
}

/* ─── Busca via proxy + cache localStorage ─── */
async function loadReviews() {
    /* Verifica cache */
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
            const { data, ts } = JSON.parse(raw);
            if (Date.now() - ts < CACHE_TTL) { renderReviews(data); return; }
        }
    } catch { /* cache corrompido — ignora e rebusca */ }

    /* Busca nova */
    try {
        const res  = await fetch(`${REVIEWS_PROXY}/places?place_id=${PLACE_ID}`);
        const json = await res.json();
        if (json.result) {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.result, ts: Date.now() })); } catch {}
            renderReviews(json.result);
        } else {
            enhanceStaticCards();
        }
    } catch (err) {
        console.warn('[Reviews] Proxy indisponível, usando fallback estático:', err.message);
        enhanceStaticCards();
    }
}

/* ─── Configura CTAs com URLs reais ─── */
function initCTA() {
    document.querySelectorAll('[data-review-write-url]').forEach(el => {
        el.href = REVIEW_WRITE;
    });
}

/* ─── Entry point — lazy (IntersectionObserver) ─── */
document.addEventListener('DOMContentLoaded', () => {
    initCTA();
    const section = document.getElementById('reviews');
    if (!section) return;

    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) { loadReviews(); obs.unobserve(e.target); }
        });
    }, { threshold: 0.1 });

    obs.observe(section);
});
