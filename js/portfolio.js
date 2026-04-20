/**
 * RENOSTTER SITE — Portfolio Carousel & Filters
 * Gerencia a interatividade da seção "Nosso Trabalho"
 */

document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.getElementById('portfolioCarousel');
    const cards = Array.from(carousel.querySelectorAll('.portfolio-card'));
    const filterBtns = document.querySelectorAll('.filter-btn');
    const prevBtn = document.querySelector('.carousel-nav.prev');
    const nextBtn = document.querySelector('.carousel-nav.next');

    // ─── 1. FILTERS ───
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');

            // Toggle active class
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter cards with animation
            cards.forEach(card => {
                const cat = card.getAttribute('data-cat');

                // Reset state
                card.style.display = 'none';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';

                if (filter === 'all' || filter === cat) {
                    card.style.display = 'block';
                    // Trigger reflow for animation
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1)';
                    }, 10);
                }
            });

            // Reset carousel scroll to start after filtering
            carousel.scrollTo({ left: 0, behavior: 'smooth' });

            // Toggle Featured Video Stage
            const featuredVideoContainer = document.getElementById('featuredVideoContainer');
            if (featuredVideoContainer) {
                if (filter === 'all' || filter === 'video') {
                    featuredVideoContainer.style.display = 'block';
                } else {
                    featuredVideoContainer.style.display = 'none';
                }
            }
        });
    });

    // ─── 2. NAVIGATION ───
    const getScrollAmount = () => {
        const cardWidth = cards[0].offsetWidth;
        const gap = 24;
        return cardWidth + gap;
    };

    nextBtn.addEventListener('click', () => {
        carousel.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
    });

    prevBtn.addEventListener('click', () => {
        carousel.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
    });

    // ─── 3. DRAG TO SCROLL (Optional but recommended for Desktop) ───
    let isDown = false;
    let startX;
    let scrollLeft;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        carousel.classList.add('active-drag');
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
        isDown = false;
        carousel.classList.remove('active-drag');
    });

    carousel.addEventListener('mouseup', () => {
        isDown = false;
        carousel.classList.remove('active-drag');
    });

    carousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 2; // scroll-fast
        carousel.scrollLeft = scrollLeft - walk;
    });

    // ─── 4. FEATURED VIDEO SWAP ───
    const featuredVideoContainer = document.getElementById('featuredVideoContainer');
    const featuredVideoPlayer = document.getElementById('featuredVideoPlayer');

    cards.forEach(card => {
        if (card.getAttribute('data-cat') === 'video') {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const videoElement = card.querySelector('video');

                if (videoElement && featuredVideoPlayer) {
                    featuredVideoPlayer.src = videoElement.src;
                    featuredVideoPlayer.play().catch(e => console.log('Auto-play prevented', e));

                    // Smooth scroll up to the featured video
                    featuredVideoContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    });
});
