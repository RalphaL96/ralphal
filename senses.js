/* Ralpha L. — Elige tu sentido: Ver, Oír o Calma.
   La elección se guarda en este navegador. El sonido nunca arranca sin un gesto del visitante. */
(function () {
    'use strict';
    var KEY = 'ralphal-sense';
    var html = document.documentElement;
    function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    var sense = get() || 'ver';
    html.setAttribute('data-sense', sense);
    var LABEL = { ver: 'Ver', oir: 'Oír', calma: 'Calma' };

    /* ---------------- ambiente sonoro ---------------- */
    var ac = null, master = null, nodes = [], timers = [], soundOn = false;
    var page = document.body.getAttribute('data-ambient') || 'home';
    var PROFILES = {
        home:   { notes: [110, 164.81, 196, 246.94, 261.63], cut: 900, bright: .35 },
        about:  { notes: [98, 146.83, 196, 220, 293.66], cut: 700, bright: .25 },
        soulfire: { notes: [73.42, 110, 146.83, 185, 220], cut: 800, ocean: true, bright: .3 },
        'abstraccion-emocional': { notes: [87.31, 130.81, 174.61, 220, 261.63], cut: 1000, pluck: [523.25, 587.33, 698.46, 783.99, 880], every: 2600 },
        'penguin-endless-love': { notes: [130.81, 196, 261.63, 329.63, 392], cut: 1600, bright: .5, pluck: [1046.5, 1174.66, 1318.51], every: 3800 },
        marthina: { notes: [87.31, 130.81, 164.81, 220, 261.63], cut: 1300, bright: .45, ocean: true },
        lphanty: { notes: [98, 146.83, 196, 246.94], cut: 800, pluck: [783.99, 659.25, 587.33, 523.25, 587.33, 659.25], every: 520, music: true },
        'diseno-industrial': { notes: [55, 82.41, 110, 116.54], cut: 520, bright: .2 },
        laboratorio: { notes: [110, 164.81, 220, 277.18], cut: 1100, bright: .4 },
        'start-project': { notes: [110, 164.81, 196, 246.94], cut: 800, bright: .3 }
    };
    function startSound() {
        if (soundOn) return;
        try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        ac.resume();
        var P = PROFILES[page] || PROFILES.home, now = ac.currentTime;
        master = ac.createGain(); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(.11, now + 3); master.connect(ac.destination);
        var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.cut; lp.Q.value = .7; lp.connect(master);
        var lfo = ac.createOscillator(), lfoG = ac.createGain(); lfo.frequency.value = .05; lfoG.gain.value = P.cut * .45; lfo.connect(lfoG).connect(lp.frequency); lfo.start(); nodes.push(lfo);
        P.notes.forEach(function (f, i) {
            [-4, 4].forEach(function (cents, j) {
                var o = ac.createOscillator(), g = ac.createGain();
                o.type = j ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = cents;
                g.gain.value = (.18 / P.notes.length) * (j ? (P.bright || .3) : 1);
                var trem = ac.createOscillator(), tg = ac.createGain(); trem.frequency.value = .07 + i * .031; tg.gain.value = g.gain.value * .5; trem.connect(tg).connect(g.gain); trem.start();
                o.connect(g).connect(lp); o.start(); nodes.push(o, trem);
            });
        });
        if (P.ocean) {
            var len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), last = 0;
            for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
            var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
            var nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 600;
            var ng = ac.createGain(); ng.gain.value = .35;
            var wave = ac.createOscillator(), wg = ac.createGain(); wave.frequency.value = .09; wg.gain.value = .3; wave.connect(wg).connect(ng.gain); wave.start();
            src.connect(nf).connect(ng).connect(master); src.start(); nodes.push(src, wave);
        }
        if (P.pluck) {
            var idx = 0;
            timers.push(setInterval(function () {
                if (!P.music && Math.random() < .35) return;
                var f = P.music ? P.pluck[idx++ % P.pluck.length] : P.pluck[Math.floor(Math.random() * P.pluck.length)];
                var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
                o.type = P.music ? 'triangle' : 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(P.music ? .05 : .07, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + (P.music ? .9 : 2.4));
                o.connect(g).connect(master); o.start(t); o.stop(t + 2.5);
            }, P.every));
        }
        soundOn = true; paintSound();
    }
    function stopSound() {
        if (!soundOn) return;
        var m = master, n = nodes.slice(); nodes = []; timers.forEach(clearInterval); timers = [];
        try { m.gain.cancelScheduledValues(ac.currentTime); m.gain.setValueAtTime(m.gain.value, ac.currentTime); m.gain.linearRampToValueAtTime(0, ac.currentTime + .8); } catch (e) {}
        setTimeout(function () { n.forEach(function (x) { try { x.stop(); } catch (e) {} }); try { m.disconnect(); } catch (e) {} }, 900);
        soundOn = false; paintSound();
    }

    /* ---------------- interfaz ---------------- */
    var soundBtn = null;
    function paintSound() {
        if (!soundBtn) return;
        soundBtn.hidden = sense !== 'oir' || page === 'cabina';
        soundBtn.setAttribute('aria-pressed', soundOn);
        soundBtn.innerHTML = '<span class="snd-bars" aria-hidden="true"><i></i><i></i><i></i></span>' + (soundOn ? 'Sonido activo' : 'Activar sonido');
        soundBtn.classList.toggle('playing', soundOn);
    }
    function paintNav() {
        document.querySelectorAll('[data-sense-open]').forEach(function (b) { b.innerHTML = '<span class="sense-dot" aria-hidden="true"></span><span class="sense-word">' + LABEL[sense] + '</span>'; b.setAttribute('aria-label', 'Elegir sentido. Actual: ' + LABEL[sense]); });
    }
    function setSense(v, fromGesture) {
        sense = v; save(v); html.setAttribute('data-sense', v); paintNav();
        if (v === 'oir') { if (fromGesture) startSound(); } else stopSound();
        paintSound();
        document.dispatchEvent(new CustomEvent('ralphal:sense', { detail: v }));
        if (v === 'calma') toast();
    }

    var overlay = null;
    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'sense-overlay'; overlay.hidden = true;
        overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'sense-title');
        overlay.innerHTML =
            '<div class="sense-panel">' +
            '<p class="sense-kicker">Let your senses lead</p>' +
            '<h2 id="sense-title">¿Cómo quieres entrar?</h2>' +
            '<div class="sense-options">' +
            '<button type="button" class="sense-opt" data-pick="ver"><span class="sense-n">01</span><b>Ver</b><span>Luz, color y movimiento. La experiencia completa.</span></button>' +
            '<button type="button" class="sense-opt" data-pick="oir"><span class="sense-n">02</span><b>Oír</b><span>Todo lo anterior, con un ambiente sonoro distinto en cada proyecto.</span></button>' +
            '<button type="button" class="sense-opt" data-pick="calma"><span class="sense-n">03</span><b>Calma</b><span>Menos movimiento y una pausa de un minuto para respirar.</span></button>' +
            '</div>' +
            '<button type="button" class="sense-skip" data-skip>Saltar</button>' +
            '<p class="sense-foot">Puedes cambiarlo cuando quieras desde el menú.</p>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { setSense(b.getAttribute('data-pick'), true); closeOverlay(); }); });
        overlay.querySelector('[data-skip]').addEventListener('click', function () { if (!get()) save('ver'); closeOverlay(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) { if (!get()) save('ver'); closeOverlay(); } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay && !overlay.hidden) { if (!get()) save('ver'); closeOverlay(); } });
    }
    var lastFocus = null;
    function openOverlay() {
        if (!overlay) buildOverlay();
        lastFocus = document.activeElement;
        overlay.hidden = false; requestAnimationFrame(function () { overlay.classList.add('show'); });
        overlay.querySelectorAll('[data-pick]').forEach(function (b) { b.classList.toggle('current', b.getAttribute('data-pick') === sense && !!get()); });
        var cur = overlay.querySelector('.sense-opt.current') || overlay.querySelector('.sense-opt'); cur.focus();
        document.body.classList.add('sense-lock');
    }
    function closeOverlay() {
        overlay.classList.remove('show'); document.body.classList.remove('sense-lock');
        setTimeout(function () { overlay.hidden = true; }, 350);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    var toastEl = null;
    function toast() {
        if (page === 'about') return;
        if (!toastEl) { toastEl = document.createElement('a'); toastEl.className = 'sense-toast'; toastEl.href = '/about#pausa'; toastEl.innerHTML = '<b>Modo calma</b> ¿Una pausa de un minuto? →'; document.body.appendChild(toastEl); }
        toastEl.classList.add('show'); setTimeout(function () { toastEl.classList.remove('show'); }, 7000);
    }

    function init() {
        paintNav();
        document.querySelectorAll('[data-sense-open]').forEach(function (b) { b.addEventListener('click', openOverlay); });
        soundBtn = document.createElement('button'); soundBtn.type = 'button'; soundBtn.className = 'sound-float'; soundBtn.hidden = true;
        soundBtn.addEventListener('click', function () { soundOn ? stopSound() : startSound(); });
        document.body.appendChild(soundBtn); paintSound();
        // modo Oír en una página nueva: el navegador exige un gesto para sonar
        if (sense === 'oir' && page !== 'cabina') {
            var arm = function (e) { if (soundBtn && soundBtn.contains(e.target)) return; startSound(); window.removeEventListener('pointerdown', arm, true); window.removeEventListener('keydown', arm, true); };
            window.addEventListener('pointerdown', arm, true); window.addEventListener('keydown', arm, true);
        }
        // primera visita a la home: preguntar (se puede saltar)
        if (page === 'home' && !get()) setTimeout(openOverlay, 900);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
