/* ================================================
   RENOSTTER — PORTFOLIO.JS  v3
   Carrossel 3 colunas · YouTube @renostter
   3 vídeos/página desktop · 2 tablet · 1 mobile
   Shuffle a cada load · prev/next/dots · swipe/teclado
   ================================================ */

const PROXY_BASE_URL = 'https://renostter-gemini-proxy.adminrenostter.workers.dev';

/* Chave de fallback — remova após YOUTUBE_API_KEY estar configurada no Worker */
const YT_FALLBACK_KEY = 'AIzaSyCypB7m6IvSExERRhLaT0WDZFbCKH0Z9Wg';

const CHANNEL_ID  = 'UC7v6Y9tQzJZBzK4v8rU6Z8A';
const MAX_RESULTS = 9;  /* múltiplo de 3 — ajuste aqui para 6, 12 etc. */

/* ─── Utilitários ─── */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function toggleSpinner(show) {
    const el = document.getElementById('yc3-spinner');
    if (el) el.classList.toggle('hidden', !show);
}

/* ─── Busca via proxy (produção) ─── */
async function fetchViaProxy() {
    const params = new URLSearchParams({ channelId: CHANNEL_ID, maxResults: MAX_RESULTS });
    const res  = await fetch(`${PROXY_BASE_URL}/youtube?${params}`);
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const data = await res.json();
    if (!data.items?.length) throw new Error('Sem vídeos no proxy');
    return data.items.map(item => ({
        id:          item.id.videoId,
        title:       item.snippet.title,
        publishedAt: item.snippet.publishedAt,
    }));
}

/* ─── Busca direta (fallback com chave pública) ─── */
async function fetchDirect() {
    /* Resolve channelId dinamicamente via forHandle quando CHANNEL_ID não estiver definido */
    let cid = CHANNEL_ID;
    if (!cid) {
        const chanRes  = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?key=${YT_FALLBACK_KEY}&forHandle=@renostter&part=id`
        );
        const chanData = await chanRes.json();
        cid = chanData.items?.[0]?.id;
        if (!cid) throw new Error('channelId não encontrado pelo handle @renostter');
    }

    const params = new URLSearchParams({
        key:        YT_FALLBACK_KEY,
        channelId:  cid,
        part:       'snippet',
        order:      'date',
        maxResults: MAX_RESULTS,
        type:       'video',
    });
    const res  = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) throw new Error(`Direct HTTP ${res.status}`);
    const data = await res.json();
    if (!data.items?.length) throw new Error('Sem vídeos na API direta');
    return data.items.map(item => ({
        id:          item.id.videoId,
        title:       item.snippet.title,
        publishedAt: item.snippet.publishedAt,
    }));
}

async function fetchChannelVideos() {
    const proxyReady = PROXY_BASE_URL && !PROXY_BASE_URL.includes('SEU_USUARIO');
    return proxyReady ? fetchViaProxy() : fetchDirect();
}

/* ─── Fallback estático ─── */
const STATIC_FALLBACK = [
    { id: '99aP656ShAM', title: 'Obra em Tempo Real — Renostter Climatização', publishedAt: '' },
];

/* ════════════════════════════════════════════════
   RENDERIZAR GRID 3 COLUNAS
   ════════════════════════════════════════════════ */
function renderCarousel(videos) {
    const container = document.getElementById('youtube-carousel-3cols');
    if (!container) return;

    const vids = shuffle([...videos]);

    const slidesHTML = vids.map((v, i) => {
        const thumb   = `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
        const thumbFb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
        const dateStr = formatDate(v.publishedAt);
        return `
        <div class="yc3-slide" data-index="${i}">
            <div class="yc3-thumb-wrap yt-lite-wrap"
                 data-videoid="${v.id}"
                 role="button"
                 tabindex="0"
                 aria-label="Reproduzir: ${v.title}">
                <img
                    src="${thumb}"
                    alt="${v.title}"
                    loading="${i < 3 ? 'eager' : 'lazy'}"
                    class="yt-lite-thumb"
                    width="1280" height="720"
                    onerror="this.onerror=null;this.src='${thumbFb}'"
                />
                <button class="yt-lite-play" aria-label="Play" tabindex="-1">
                    <svg viewBox="0 0 68 48" width="56" height="40" aria-hidden="true">
                        <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
                        <path d="M45 24 27 14v20" fill="#fff"/>
                    </svg>
                </button>
            </div>
            <div class="yc3-info">
                <h3 class="yc3-title">${v.title}</h3>
                ${dateStr ? `<time class="yc3-date" datetime="${v.publishedAt}">${dateStr}</time>` : ''}
                <a href="https://www.youtube.com/watch?v=${v.id}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="yc3-yt-link"
                   aria-label="Ver '${v.title}' no YouTube">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M10 15l5.19-3L10 9v6z"/>
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
                    </svg>
                    Ver no YouTube
                </a>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="yc3-grid">${slidesHTML}</div>`;

    attachLiteEmbed();
}

/* ════════════════════════════════════════════════
   LITE EMBED — thumbnail → iframe ao clicar
   ════════════════════════════════════════════════ */
function attachLiteEmbed() {
    document.querySelectorAll('.yc3-thumb-wrap').forEach(wrap => {
        const activate = () => {
            const id = wrap.dataset.videoid;
            wrap.innerHTML = `<iframe
                src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0"
                title="Vídeo Renostter"
                referrerpolicy="strict-origin-when-cross-origin"
                frameborder="0"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:12px 12px 0 0;">
            </iframe>`;
        };
        wrap.addEventListener('click',   activate, { once: true });
        wrap.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        }, { once: true });
    });
}

/* ════════════════════════════════════════════════
   ESTADO DE ERRO AMIGÁVEL
   ════════════════════════════════════════════════ */
function renderError() {
    const c = document.getElementById('youtube-carousel-3cols');
    if (!c) return;
    c.innerHTML = `
        <div class="yc3-empty">
            <p>Nenhum vídeo disponível no momento.<br>A Renostter agradece sua compreensão!</p>
            <a href="https://www.youtube.com/@renostter"
               target="_blank"
               rel="noopener noreferrer"
               class="btn-primary"
               style="margin-top:16px;display:inline-block;">
                Ver canal no YouTube
            </a>
        </div>`;
}

/* ════════════════════════════════════════════════
   INIT — lazy via IntersectionObserver
   ════════════════════════════════════════════════ */
async function initVideoGallery() {
    toggleSpinner(true);
    try {
        const videos = await fetchChannelVideos();
        renderCarousel(videos);
    } catch (err) {
        console.warn('[Portfolio] API falhou:', err.message);
        if (STATIC_FALLBACK.length) {
            renderCarousel(STATIC_FALLBACK);
        } else {
            renderError();
        }
    } finally {
        toggleSpinner(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('video-gallery');
    if (!section) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                initVideoGallery();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    observer.observe(section);
});
