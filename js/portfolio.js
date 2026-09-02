/* ================================================
   RENOSTTER — PORTFOLIO.JS  v4
   Swiper.js · YouTube @renostter (UCPdh_nMh4XLdkVRH1jn7LuA)
   Shuffle a cada load · prev/next/dots · swipe/teclado
   Lite-embed: thumbnail → iframe ao clicar
   ================================================ */

/* ─── Configuração ─── */
const PROXY_BASE_URL  = 'https://renostter-gemini-proxy.adminrenostter.workers.dev';
const YT_FALLBACK_KEY = ''; /* chave removida — configure YOUTUBE_API_KEY no Worker: wrangler secret put YOUTUBE_API_KEY */
const CHANNEL_ID      = 'UCPdh_nMh4XLdkVRH1jn7LuA';  /* canal @renostter */
const MAX_RESULTS     = 12;  /* mais videos = mais variedade na rotacao */

/* ─── Rotação por tempo ───
   AUTOPLAY_DELAY_MS  : de quanto em quanto tempo o carrossel avanca sozinho.
   RESHUFFLE_MS       : de quanto em quanto tempo a ORDEM e sorteada de novo,
                        sem recarregar a pagina. Quem fica muito tempo no site
                        ve combinacoes diferentes.
   Ambos pausam enquanto um video esta tocando ou o mouse esta sobre o
   carrossel - trocar o slide debaixo de quem esta assistindo seria hostil. */
const AUTOPLAY_DELAY_MS = 6000;        /* 6 segundos por slide */
const RESHUFFLE_MS      = 3 * 60000;   /* re-sorteia a cada 3 minutos */

/* Respeita quem pediu menos movimento no sistema operacional. */
const PREFERS_REDUCED_MOTION =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* Estado do modulo */
let swiperInstance = null;
let cachedVideos   = [];
let reshuffleTimer = null;

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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeYoutubeId(value) {
    const id = String(value ?? '').trim();
    return /^[\w-]{6,20}$/.test(id) ? id : '';
}

function safeExternalUrl(value, fallback = '') {
    try {
        const url = new URL(value || fallback);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}

/* ─── Busca via proxy Cloudflare Worker (produção) ─── */
async function fetchViaProxy() {
    const params = new URLSearchParams({ channelId: CHANNEL_ID, maxResults: MAX_RESULTS });
    const res    = await fetch(`${PROXY_BASE_URL}/youtube?${params}`);
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const data = await res.json();
    if (!data.items?.length) throw new Error('Sem vídeos no proxy');
    return data.items.map(item => ({
        id:          item.id.videoId,
        title:       item.snippet.title,
        thumbnail:   item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
        publishedAt: item.snippet.publishedAt,
    }));
}

/* ─── Busca direta via YouTube Data API v3 (fallback) ─── */
async function fetchDirect() {
    const params = new URLSearchParams({
        key:        YT_FALLBACK_KEY,
        channelId:  CHANNEL_ID,
        part:       'snippet',
        order:      'date',
        maxResults: MAX_RESULTS,
        type:       'video',
    });
    const res  = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.items?.length) throw new Error('Canal sem vídeos ou chave inválida');
    return data.items.map(item => ({
        id:          item.id.videoId,
        title:       item.snippet.title,
        thumbnail:   item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
        publishedAt: item.snippet.publishedAt,
    }));
}

async function fetchChannelVideos() {
    const proxyReady = PROXY_BASE_URL && !PROXY_BASE_URL.includes('SEU_USUARIO');
    try {
        return proxyReady ? await fetchViaProxy() : await fetchDirect();
    } catch (proxyErr) {
        /* Se o proxy falhar, tenta direto */
        if (proxyReady) {
            console.warn('[Portfolio] Proxy falhou, tentando API direta:', proxyErr.message);
            return fetchDirect();
        }
        throw proxyErr;
    }
}

/* ─── Fallback estático (se ambas as APIs falharem) ─── */
const STATIC_FALLBACK = [
    { id: 'Emgg1jkWolE', title: 'Rotina de excelencia', thumbnail: '', publishedAt: '' },
    { id: '2-A3Gwn6YJg', title: 'Instalacao Academia IZI', thumbnail: '', publishedAt: '' },
    { id: '99aP656ShAM', title: 'Climatizacao de dutos', thumbnail: '', publishedAt: '' },
    { id: 'J5XsSC7xB3s', title: 'Climatizacao Renostter - IZI Academia', thumbnail: '', publishedAt: '' },
];

/* ════════════════════════════════════════════════
   RENDERIZAR CARROSSEL COM SWIPER.JS
   ════════════════════════════════════════════════ */
function renderCarousel(videos) {
    const container = document.getElementById('youtube-carousel-3cols');
    if (!container) return;

    /* Guarda a lista original para os re-sorteios seguintes */
    if (videos !== cachedVideos) cachedVideos = [...videos];

    /* Destroi a instancia anterior antes de trocar o HTML, senao o Swiper
       deixa listeners orfaos e o autoplay duplica a cada re-sorteio. */
    if (swiperInstance) {
        swiperInstance.destroy(true, true);
        swiperInstance = null;
    }

    /* Embaralha a ordem */
    const vids = shuffle([...videos]);

    /* Gera os slides */
    const slidesHTML = vids.map((v, i) => {
        /* Usa thumbnail vinda da API; fallback para ytimg */
        const id = safeYoutubeId(v.id);
        if (!id) return '';
        const title = escapeHtml(v.title || 'VÃ­deo Renostter');
        const publishedAt = escapeHtml(v.publishedAt || '');
        const thumb   = escapeHtml(safeExternalUrl(v.thumbnail, `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`));
        const thumbFb = escapeHtml(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
        const dateStr = escapeHtml(formatDate(v.publishedAt));

        return `
        <div class="swiper-slide yc3-slide">

            <!-- Thumbnail clicável → ativa iframe ao clicar -->
            <div class="yc3-thumb-wrap"
                 data-videoid="${id}"
                 data-title="${title}"
                 data-thumb="${thumb}"
                 data-thumbfb="${thumbFb}"
                 role="button"
                 tabindex="0"
                 aria-label="Reproduzir: ${title}">

                <img src="${thumb}"
                     alt="${title}"
                     loading="${i < 3 ? 'eager' : 'lazy'}"
                     class="yt-lite-thumb"
                     width="480" height="854"
                     onerror="this.onerror=null;this.src='${thumbFb}'">

                <!-- Botão play estilo YouTube -->
                <button class="yt-lite-play" aria-label="Reproduzir vídeo" tabindex="-1">
                    <svg viewBox="0 0 68 48" width="56" height="40" aria-hidden="true">
                        <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
                        <path d="M45 24 27 14v20" fill="#fff"/>
                    </svg>
                </button>
            </div>

            <!-- Informações abaixo do vídeo -->
            <div class="yc3-info">
                <h3 class="yc3-title">${title}</h3>
                ${dateStr ? `<time class="yc3-date" datetime="${publishedAt}">${dateStr}</time>` : ''}
                <a href="https://www.youtube.com/watch?v=${id}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="yc3-yt-link"
                   aria-label="Ver '${title}' no YouTube">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M10 15l5.19-3L10 9v6z"/>
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
                    </svg>
                    Ver no YouTube
                </a>
            </div>

        </div>`;
    }).join('');

    /* Injeta estrutura Swiper no container */
    container.innerHTML = `
        <div class="swiper yc3-swiper">
            <div class="swiper-wrapper">
                ${slidesHTML}
            </div>
            <!-- Dots de paginação -->
            <div class="swiper-pagination yc3-pagination"></div>
            <!-- Botões de navegação -->
            <div class="swiper-button-prev yc3-prev" aria-label="Vídeos anteriores"></div>
            <div class="swiper-button-next yc3-next" aria-label="Próximos vídeos"></div>
        </div>`;

    /* Inicializa Swiper após injetar o HTML */
    initSwiper();

    /* Ativa lite-embed nos thumbnails */
    attachLiteEmbed();
}

/* ════════════════════════════════════════════════
   INICIALIZAÇÃO DO SWIPER.JS
   ════════════════════════════════════════════════ */
function initSwiper() {
    if (typeof Swiper === 'undefined') {
        console.error('[Portfolio] Swiper.js não carregado.');
        return;
    }

    swiperInstance = new Swiper('#youtube-carousel-3cols .yc3-swiper', {
        /* Avanco automatico. false quando o usuario pediu menos movimento. */
        autoplay: PREFERS_REDUCED_MOTION ? false : {
            delay: AUTOPLAY_DELAY_MS,
            disableOnInteraction: false,  /* volta a girar depois do swipe */
            pauseOnMouseEnter: true,      /* para enquanto o mouse esta em cima */
        },
        loop: false,

        /* Layout */
        slidesPerView: 1,
        spaceBetween:  16,
        centeredSlides: false,

        /* Interação */
        grabCursor:    true,
        touchRatio:    1,
        resistance:    true,
        resistanceRatio: 0.85,

        /* Teclado e acessibilidade */
        keyboard:      { enabled: true, onlyInViewport: true },
        a11y:          { enabled: true },

        /* Paginação (dots) */
        pagination: {
            el:              '.yc3-pagination',
            clickable:       true,
            dynamicBullets:  true,
        },

        /* Navegação (setas) */
        navigation: {
            prevEl: '.yc3-prev',
            nextEl: '.yc3-next',
        },

        /* Responsivo: 2 colunas tablet · 3 colunas desktop */
        breakpoints: {
            640:  { slidesPerView: 2, spaceBetween: 20 },
            1024: { slidesPerView: 3, spaceBetween: 24 },
            1280: { slidesPerView: 4, spaceBetween: 24 },
        },
    });
}

/* ════════════════════════════════════════════════
   LITE-EMBED — thumbnail → iframe ao clicar/Enter
   Evita carregar 9 iframes de uma vez (performance)
   ════════════════════════════════════════════════ */
function closeInlineVideo(activeWrap) {
    if (!activeWrap) return;

    const id = safeYoutubeId(activeWrap.dataset.videoid);
    const title = escapeHtml(activeWrap.dataset.title || 'Video Renostter');
    const thumb = escapeHtml(activeWrap.dataset.thumb || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
    const thumbFb = escapeHtml(activeWrap.dataset.thumbfb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);

    /* Video fechado: o carrossel pode voltar a girar. */
    if (swiperInstance?.autoplay && !PREFERS_REDUCED_MOTION) swiperInstance.autoplay.start();

    activeWrap.classList.remove('is-playing');
    activeWrap.setAttribute('role', 'button');
    activeWrap.setAttribute('tabindex', '0');
    activeWrap.setAttribute('aria-label', `Reproduzir: ${title}`);
    activeWrap.innerHTML = `
        <img src="${thumb}"
             alt="${title}"
             loading="lazy"
             class="yt-lite-thumb"
             width="480" height="854"
             onerror="this.onerror=null;this.src='${thumbFb}'">
        <button class="yt-lite-play" aria-label="Reproduzir video" tabindex="-1">
            <svg viewBox="0 0 68 48" width="56" height="40" aria-hidden="true">
                <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
                <path d="M45 24 27 14v20" fill="#fff"/>
            </svg>
        </button>`;
}

function playInlineVideo(wrap) {
    if (!wrap) return;
    const id = safeYoutubeId(wrap.dataset.videoid);
    const safeId = safeYoutubeId(id);
    if (!safeId) return;

    document.querySelectorAll('.yc3-thumb-wrap.is-playing').forEach(closeInlineVideo);

    /* Ninguem quer que o slide troque no meio do video. */
    if (swiperInstance?.autoplay) swiperInstance.autoplay.stop();

    const title = wrap.dataset.title || 'Video Renostter';
    wrap.classList.add('is-playing');
    wrap.removeAttribute('role');
    wrap.removeAttribute('tabindex');
    wrap.setAttribute('aria-label', `Reproduzindo: ${title}`);
    wrap.innerHTML = `
        <iframe
        src="https://www.youtube-nocookie.com/embed/${safeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
        title="${escapeHtml(title || 'Video Renostter')}"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="eager"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
        </iframe>`;
}

function attachLiteEmbed() {
    document.querySelectorAll('.yc3-thumb-wrap').forEach(wrap => {
        const activate = () => {
            if (wrap.classList.contains('is-playing')) return;
            playInlineVideo(wrap);
        };

        wrap.addEventListener('click', activate);
        wrap.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
    });
}

/* ════════════════════════════════════════════════
   RE-SORTEIO PERIODICO
   Troca a ordem sem recarregar a pagina. Pula a rodada se houver video
   tocando ou se a aba estiver em segundo plano - re-renderizar ali seria
   trabalho jogado fora, e mataria a reproducao em andamento.
   ════════════════════════════════════════════════ */
function startReshuffleTimer() {
    if (reshuffleTimer) clearInterval(reshuffleTimer);
    if (PREFERS_REDUCED_MOTION) return;

    reshuffleTimer = setInterval(() => {
        if (document.hidden) return;
        if (document.querySelector('.yc3-thumb-wrap.is-playing')) return;
        if (cachedVideos.length < 2) return;
        renderCarousel(cachedVideos);
    }, RESHUFFLE_MS);
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
   Só busca quando a seção entrar no viewport
   ════════════════════════════════════════════════ */
async function initVideoGallery() {
    toggleSpinner(true);
    try {
        const videos = await fetchChannelVideos();
        renderCarousel(videos);
        startReshuffleTimer();
    } catch (err) {
        console.warn('[Portfolio] APIs falharam, usando fallback estático:', err.message);
        if (STATIC_FALLBACK.length) {
            renderCarousel(STATIC_FALLBACK);
            startReshuffleTimer();
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

    /* Carrega apenas quando a seção aparecer na tela */
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
