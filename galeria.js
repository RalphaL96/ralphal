/* Galería viva: pasa el cursor o toca una obra para ver su capa viva. */
(function () {
    var hover = window.matchMedia('(hover: hover)').matches;
    document.querySelectorAll('[data-obra]').forEach(function (obra) {
        var frame = obra.querySelector('.obra-frame'), v = obra.querySelector('video');
        function on() {
            if (!v.src) v.src = v.getAttribute('data-src');
            v.currentTime = 0; var p = v.play(); if (p) p.catch(function () {});
            obra.classList.add('vivo');
        }
        function off() { obra.classList.remove('vivo'); setTimeout(function () { if (!obra.classList.contains('vivo')) v.pause(); }, 600); }
        if (hover) { frame.addEventListener('mouseenter', on); frame.addEventListener('mouseleave', off); frame.addEventListener('focus', on); frame.addEventListener('blur', off); }
        frame.addEventListener('click', function () { obra.classList.contains('vivo') && !hover ? off() : on(); });
    });
})();
