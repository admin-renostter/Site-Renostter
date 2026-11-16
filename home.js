/* =========================================================
   RENOSTTER — HOME "ETIQUETA"
   Entrada das secoes: cada bloco [data-reveal] sobe em
   sequencia quando entra na tela. Sem JS, ou com movimento
   reduzido, tudo ja aparece pronto (o CSS so esconde sob
   html.js-reveal e prefers-reduced-motion: no-preference).
   ========================================================= */
(function entradaDasSecoes() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const alvos = document.querySelectorAll('[data-reveal], .os-output');
    if (!alvos.length) return;

    document.documentElement.classList.add('js-reveal');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    alvos.forEach((el) => observer.observe(el));
})();
