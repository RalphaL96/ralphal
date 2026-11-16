/* Carga model-viewer solo cuando el bloque de AR se acerca a la pantalla. */
(function () {
    var block = document.querySelector('[data-ar]'); if (!block) return;
    var mv = block.querySelector('model-viewer');
    var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return; io.disconnect();
        var s = document.createElement('script'); s.type = 'module'; s.src = '/vendor/model-viewer/model-viewer.min.js';
        document.head.appendChild(s);
        customElements.whenDefined('model-viewer').then(function () {
            var MV = customElements.get('model-viewer');
            MV.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js';
            mv.src = mv.getAttribute('data-src');
        });
    }, { rootMargin: '400px' });
    io.observe(block);
})();
