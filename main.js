document.addEventListener('DOMContentLoaded', () => {

    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    // Custom cursor
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorOutline = document.querySelector('.cursor-outline');
    if (!isTouchDevice && cursorDot && cursorOutline) {
        window.addEventListener('mousemove', (e) => {
            cursorDot.style.left = `${e.clientX}px`;
            cursorDot.style.top = `${e.clientY}px`;
            cursorOutline.animate({ left: `${e.clientX}px`, top: `${e.clientY}px` }, { duration: 500, fill: 'forwards' });
        });
        document.querySelectorAll('a, button, .service-item, video[controls]').forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursorOutline.style.width = '60px';
                cursorOutline.style.height = '60px';
                cursorOutline.style.backgroundColor = 'rgba(245, 245, 245, 0.1)';
            });
            el.addEventListener('mouseleave', () => {
                cursorOutline.style.width = '40px';
                cursorOutline.style.height = '40px';
                cursorOutline.style.backgroundColor = 'transparent';
            });
        });
    } else {
        document.documentElement.style.cursor = 'auto';
    }

    // Contact popup: tap to open on touch screens
    document.querySelectorAll('.nav-contact-wrapper').forEach(w => {
        const btn = w.querySelector('.contact-btn');
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); w.classList.toggle('open'); });
    });
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-contact-wrapper.open').forEach(w => { if (!w.contains(e.target)) w.classList.remove('open'); });
    });

    // Light mapping effect on the hero portrait
    const container = document.getElementById('light-map-container');
    const effect = document.querySelector('.light-map-effect');
    const heroImg = document.getElementById('hero-img');
    if (container && heroImg && !isTouchDevice) {
        const quadrants = ['assets/hero-3.webp', 'assets/hero-4.webp', 'assets/hero-1.webp', 'assets/hero-2.webp'];
        quadrants.forEach(src => { const i = new Image(); i.src = src; });
        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            effect.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(138, 43, 226, 0.6) 0%, transparent 50%)`;
            effect.style.opacity = '1';
            heroImg.style.transform = `translate(${(x - 50) * 0.05}%, ${(y - 50) * 0.05}%) scale(1.02)`;
            const q = (y < 50 ? 0 : 2) + (x < 50 ? 0 : 1);
            if (!heroImg.src.endsWith(quadrants[q])) heroImg.src = quadrants[q];
        });
        container.addEventListener('mouseleave', () => {
            effect.style.opacity = '0';
            heroImg.style.transform = 'translate(0, 0) scale(1)';
        });
    }

    // Autoplay muted loops only while visible (saves data and battery)
    const loops = document.querySelectorAll('video[data-loop]');
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(({ target, isIntersecting }) => {
                if (isIntersecting) { target.muted = true; const p = target.play(); if (p) p.catch(() => {}); }
                else target.pause();
            });
        }, { rootMargin: '150px' });
        loops.forEach(v => io.observe(v));
    } else {
        loops.forEach(v => { v.muted = true; v.play(); });
    }

    // Year in footer
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
});
