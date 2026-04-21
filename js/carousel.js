/* ============================
   RENOSTTER — CAROUSEL.JS
   ============================ */

document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.getElementById('technical-video-container');
    const prevBtn = document.getElementById('videoPrev');
    const nextBtn = document.getElementById('videoNext');

    if (!carousel || !prevBtn || !nextBtn) return;

    // ─── NAV BUTTONS ─────────────────────────────────────────
    const scrollAmount = 350; // Approximated item width + gap

    prevBtn.addEventListener('click', () => {
        carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });

    // Update button states on scroll
    const updateButtons = () => {
        const scrollLeft = carousel.scrollLeft;
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;

        prevBtn.style.opacity = scrollLeft <= 5 ? '0.3' : '1';
        prevBtn.style.pointerEvents = scrollLeft <= 5 ? 'none' : 'auto';

        nextBtn.style.opacity = scrollLeft >= maxScroll - 5 ? '0.3' : '1';
        nextBtn.style.pointerEvents = scrollLeft >= maxScroll - 5 ? 'none' : 'auto';
    };

    carousel.addEventListener('scroll', updateButtons);
    window.addEventListener('resize', updateButtons);
    setTimeout(updateButtons, 500); // Initial check after JS injection

    // ─── DRAG TO SCROLL ──────────────────────────────────────
    let isDown = false;
    let startX;
    let scrollLeft;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        carousel.classList.add('active');
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
        isDown = false;
    });

    carousel.addEventListener('mouseup', () => {
        isDown = false;
    });

    carousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 2; // scroll-fast
        carousel.scrollLeft = scrollLeft - walk;
    });

    // Support for touch devices is handled by native overflow-x: auto
});
