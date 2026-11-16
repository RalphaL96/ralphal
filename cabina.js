/* Ralpha L. — Cabina abierta: mezcla en vivo con loops y visuales reales. */
(function () {
    'use strict';
    var root = document.querySelector('[data-cabina-pro]');
    if (!root) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    var $ = function (s) { return root.querySelector(s); };
    var cv = $('canvas.cab-canvas');
    var gl = cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) { root.classList.add('no-gl'); return; }

    /* ---------- shader ---------- */
    var FRAG = [
        'precision highp float;',
        'uniform sampler2D A; uniform sampler2D B;',
        'uniform vec2 r; uniform float t, x, kal, rgb, mir, wav, pul, beat, stA, stB;',
        'vec2 cover(vec2 uv){ float ca=r.x/r.y, ta=16./9.; vec2 u=uv-.5; if(ca>ta) u.y*=ta/ca; else u.x*=ca/ta; return u+.5; }',
        'vec2 kf(vec2 p){ float a=atan(p.y,p.x),l=length(p),N=6.; a=mod(a,6.28318/N); a=abs(a-3.14159/N); return l*vec2(cos(a),sin(a)); }',
        'vec2 fx(vec2 uv){',
        '  vec2 p=uv-.5; p.x*=r.x/r.y;',
        '  if(kal>.5) p=kf(p);',
        '  p*=1.-.06*pul*beat;',
        '  p.x/=r.x/r.y; uv=p+.5;',
        '  if(mir>.5) uv.x=.5-abs(uv.x-.5);',
        '  uv+=wav*.018*vec2(sin(uv.y*9.+t*1.7),cos(uv.x*7.-t*1.3));',
        '  return uv;',
        '}',
        'vec3 samp(sampler2D s, vec2 uv, float still){',
        '  if(still>.5){ uv=(uv-.5)*(1.-.05-.03*sin(t*.12))+.5+vec2(sin(t*.07),cos(t*.05))*.02; uv+=.008*vec2(sin(uv.y*5.+t*.6),cos(uv.x*4.-t*.5)); }',
        '  uv=clamp(uv,.001,.999);',
        '  return texture2D(s,uv).rgb;',
        '}',
        'vec3 mixd(vec2 uv){ vec2 c=cover(fx(uv)); return mix(samp(A,c,stA),samp(B,c,stB),x); }',
        'void main(){',
        '  vec2 uv=gl_FragCoord.xy/r; uv.y=1.-uv.y;',
        '  float o=rgb*(.004+.012*beat*pul+.004*sin(t*2.));',
        '  vec3 c=vec3(mixd(uv+vec2(o,0.)).r, mixd(uv).g, mixd(uv-vec2(o,0.)).b);',
        '  c*=1.+.25*beat*pul;',
        '  gl_FragColor=vec4(c,1.);',
        '}'
    ].join('\n');
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr); gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; function u(n) { if (!(n in U)) U[n] = gl.getUniformLocation(pr, n); return U[n]; }
    function mkTex(unit) {
        var tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([5, 5, 5]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tx;
    }
    var decks = [{ unit: 0, tex: mkTex(0), media: null, still: 1, name: '', btn: null }, { unit: 1, tex: mkTex(1), media: null, still: 1, name: '', btn: null }];
    gl.uniform1i(u('A'), 0); gl.uniform1i(u('B'), 1);

    function upload(d) {
        var m = d.media; if (!m) return;
        if (m.tagName === 'VIDEO' && m.readyState < 2) return;
        gl.activeTexture(gl.TEXTURE0 + d.unit); gl.bindTexture(gl.TEXTURE_2D, d.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, m);
    }

    /* ---------- state + controls ---------- */
    var state = { x: +$('[data-xf]').value, kal: 0, rgb: 1, mir: 0, wav: 0, pul: 1 };
    var target = 0; // deck where the next clip loads
    var deckLbl = [$('[data-deck-a]'), $('[data-deck-b]')];
    var targetBtns = root.querySelectorAll('[data-target]');
    function setTarget(i) { target = i; targetBtns.forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-target') === i); }); }
    targetBtns.forEach(function (b) { b.addEventListener('click', function () { setTarget(+b.getAttribute('data-target')); }); });

    function loadClip(btn, deckIdx) {
        var d = decks[deckIdx], src = btn.getAttribute('data-src'), kind = btn.getAttribute('data-kind'), name = btn.getAttribute('data-name');
        if (d.media && d.media.tagName === 'VIDEO') { d.media.pause(); d.media.removeAttribute('src'); d.media.load(); }
        if (d.btn) d.btn.classList.remove('on-a', 'on-b');
        d.btn = btn; btn.classList.add(deckIdx ? 'on-b' : 'on-a');
        d.name = name; deckLbl[deckIdx].textContent = name;
        btn.classList.add('loading');
        if (kind === 'video') {
            var v = document.createElement('video');
            v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = src;
            v.addEventListener('canplay', function () { btn.classList.remove('loading'); }, { once: true });
            var p = v.play(); if (p) p.catch(function () {});
            d.media = v; d.still = 0;
        } else {
            var im = new Image(); im.onload = function () { btn.classList.remove('loading'); d.media = im; d.still = 1; upload(d); }; im.src = src;
            d.media = null; d.still = 1;
        }
    }
    var clips = root.querySelectorAll('[data-clip]');
    clips.forEach(function (b) {
        b.addEventListener('click', function () { start(); loadClip(b, target); setTarget(target ? 0 : 1); });
    });
    $('[data-xf]').addEventListener('input', function (e) { state.x = +e.target.value; });
    root.querySelectorAll('[data-fx]').forEach(function (b) {
        b.addEventListener('click', function () { var k = b.getAttribute('data-fx'); var v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); state[k] = v ? 1 : 0; });
    });

    /* ---------- sound: 120 BPM beat ---------- */
    var ac = null, master = null, recDest = null, playing = false, t0 = 0, nextBeat = 0, beatIdx = 0, sched = 0, noiseBuf = null, bpm = 120;
    var sndBtn = $('[data-snd]');
    function ensureAudio() {
        if (ac) return;
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = .8; master.connect(ac.destination);
        if (ac.createMediaStreamDestination) { recDest = ac.createMediaStreamDestination(); master.connect(recDest); }
    }
    function kick(time) { var o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, time); o.frequency.exponentialRampToValueAtTime(42, time + .14); g.gain.setValueAtTime(.9, time); g.gain.exponentialRampToValueAtTime(.001, time + .32); o.connect(g).connect(master); o.start(time); o.stop(time + .34); }
    function hat(time) { if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * .1, ac.sampleRate); var dd = noiseBuf.getChannelData(0); for (var i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; } var s = ac.createBufferSource(); s.buffer = noiseBuf; var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; var g = ac.createGain(); g.gain.setValueAtTime(.16, time); g.gain.exponentialRampToValueAtTime(.001, time + .06); s.connect(f).connect(g).connect(master); s.start(time); s.stop(time + .07); }
    var notes = [55, 55, 65.41, 49];
    function bass(time, i) { var SP = 60 / bpm, o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = notes[(i >> 2) % 4]; f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(.0001, time); g.gain.exponentialRampToValueAtTime(.15, time + .02); g.gain.exponentialRampToValueAtTime(.001, time + SP * .45); o.connect(f).connect(g).connect(master); o.start(time); o.stop(time + SP * .5); }
    function scheduler() { var SP = 60 / bpm; while (nextBeat < ac.currentTime + .12) { kick(nextBeat); hat(nextBeat + SP / 2); bass(nextBeat + SP / 2, beatIdx); nextBeat += SP; beatIdx++; } }
    sndBtn.addEventListener('click', function () {
        var on = sndBtn.getAttribute('aria-pressed') !== 'true';
        if (on) { try { ensureAudio(); ac.resume(); t0 = ac.currentTime + .05; nextBeat = t0; beatIdx = 0; sched = setInterval(scheduler, 25); playing = true; } catch (e) { on = false; } }
        else { clearInterval(sched); playing = false; }
        sndBtn.setAttribute('aria-pressed', on);
    });
    var bpmEl = $('[data-bpm]'), taps = [];
    $('[data-tap]').addEventListener('click', function () {
        var now = performance.now(); taps = taps.filter(function (tp) { return now - tp < 2500; }); taps.push(now);
        if (taps.length > 2) { var iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); bpm = Math.max(70, Math.min(170, Math.round(60000 / iv))); bpmEl.textContent = bpm; if (playing) { t0 = ac.currentTime; nextBeat = t0 + .02; } }
    });

    /* ---------- recording (8 s, with watermark) ---------- */
    var recBtn = $('[data-rec]'), recOut = $('[data-rec-out]'), recCanvas = document.createElement('canvas'), recCtx = recCanvas.getContext('2d'), recording = false;
    function pickType() {
        var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (var i = 0; i < types.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
        return '';
    }
    if (!window.MediaRecorder || !recCanvas.captureStream) { recBtn.hidden = true; }
    recBtn.addEventListener('click', function () {
        if (recording) return;
        start();
        var type = pickType(); if (!type && !window.MediaRecorder) return;
        recCanvas.width = 1280; recCanvas.height = 720;
        var stream = recCanvas.captureStream(30);
        if (recDest && playing) recDest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
        var chunks = [], mr;
        try { mr = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4e6 }) : new MediaRecorder(stream); } catch (e) { return; }
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
            recording = false; recBtn.textContent = 'Grabar 8 s'; recBtn.classList.remove('rec-on');
            var mime = (mr.mimeType || type || 'video/webm').split(';')[0], ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
            var blob = new Blob(chunks, { type: mime }), url = URL.createObjectURL(blob), name = 'ralphal-cabina.' + ext;
            recOut.hidden = false;
            recOut.innerHTML = '';
            var a = document.createElement('a'); a.href = url; a.download = name; a.className = 'cab-btn solid'; a.textContent = 'Descargar tu mezcla'; recOut.appendChild(a);
            var file = null; try { file = new File([blob], name, { type: mime }); } catch (e) {}
            if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                var s = document.createElement('button'); s.type = 'button'; s.className = 'cab-btn'; s.textContent = 'Compartir';
                s.addEventListener('click', function () { navigator.share({ files: [file], title: 'Mi mezcla en la cabina de Ralpha L.', text: 'ralphal.vercel.app · @ralphal.art' }).catch(function () {}); });
                recOut.appendChild(s);
            }
            var note = document.createElement('span'); note.className = 'cab-note'; note.textContent = ext === 'webm' ? 'Formato WebM. Etiqueta a @ralphal.art si la subes.' : 'Etiqueta a @ralphal.art si la subes.'; recOut.appendChild(note);
        };
        recording = true; recBtn.classList.add('rec-on');
        var left = 8; recBtn.textContent = 'Grabando ' + left + ' s';
        var iv = setInterval(function () { left--; recBtn.textContent = left > 0 ? 'Grabando ' + left + ' s' : 'Procesando'; if (left <= 0) { clearInterval(iv); mr.stop(); } }, 1000);
        mr.start(250);
    });
    function drawRecFrame() {
        recCtx.drawImage(cv, 0, 0, recCanvas.width, recCanvas.height);
        recCtx.fillStyle = 'rgba(0,0,0,.45)'; recCtx.fillRect(0, recCanvas.height - 54, recCanvas.width, 54);
        recCtx.fillStyle = '#f5f5f5'; recCtx.font = '700 22px Outfit, Arial, sans-serif'; recCtx.fillText('RALPHA L. · CABINA ABIERTA', 28, recCanvas.height - 20);
        recCtx.textAlign = 'right'; recCtx.font = '400 20px Inter, Arial, sans-serif'; recCtx.fillText('ralphal.vercel.app  ·  @ralphal.art', recCanvas.width - 28, recCanvas.height - 20); recCtx.textAlign = 'left';
    }

    /* ---------- loop ---------- */
    var started = false, visible = true, raf = 0, startOverlay = $('[data-start-overlay]');
    function start() {
        if (started) return; started = true;
        if (startOverlay) startOverlay.hidden = true;
        if (!decks[0].btn) loadClip(clips[0], 0);
        if (!decks[1].btn) loadClip(clips[clips.length > 22 ? 22 : 1], 1);
        setTarget(0);
        raf = requestAnimationFrame(frame);
    }
    $('[data-open]').addEventListener('click', start);
    function frame(ms) {
        if (!visible) { raf = 0; return; }
        var t = ms / 1000;
        var w = Math.round(cv.clientWidth * DPR), h = Math.round(cv.clientHeight * DPR);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
        decks.forEach(function (d) { if (d.media && d.media.tagName === 'VIDEO') upload(d); });
        var ph = playing ? (ac.currentTime - t0) * bpm / 60 : t * bpm / 60;
        var beat = reduce && !playing ? 0 : Math.exp(-(((ph % 1) + 1) % 1) * 5);
        gl.uniform2f(u('r'), w, h); gl.uniform1f(u('t'), reduce ? t * .3 : t);
        gl.uniform1f(u('x'), state.x); gl.uniform1f(u('kal'), state.kal); gl.uniform1f(u('rgb'), state.rgb); gl.uniform1f(u('mir'), state.mir);
        gl.uniform1f(u('wav'), state.wav); gl.uniform1f(u('pul'), state.pul); gl.uniform1f(u('beat'), beat);
        gl.uniform1f(u('stA'), decks[0].still); gl.uniform1f(u('stB'), decks[1].still);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (recording) drawRecFrame();
        raf = requestAnimationFrame(frame);
    }
    new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        decks.forEach(function (d) { if (d.media && d.media.tagName === 'VIDEO') { if (visible && started) d.media.play().catch(function () {}); else d.media.pause(); } });
        if (visible && started && !raf) raf = requestAnimationFrame(frame);
        if (!visible && playing) sndBtn.click();
    }).observe(cv);
    document.addEventListener('keydown', function (e) {
        if (!started || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= Math.min(9, clips.length)) { loadClip(clips[n - 1], target); setTarget(target ? 0 : 1); }
    });
})();
