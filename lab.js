/* Ralpha L. — experiencias sensoriales (Cuarto oscuro, Cabina, Equilibrio, Pausa).
   Cada módulo se activa solo si su elemento existe en la página. */
(function () {
    'use strict';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    var touch = window.matchMedia('(pointer: coarse)').matches;

    /* ---------- utilidades ---------- */
    var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    function glStage(canvas, frag) {
        var gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
        if (!gl) return null;
        function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(o)); return null; } return o; }
        var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, 'precision highp float;' + frag);
        if (!vs || !fs) return null;
        var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr); gl.useProgram(pr);
        var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        var U = {};
        function u(n) { if (!(n in U)) U[n] = gl.getUniformLocation(pr, n); return U[n]; }
        return {
            gl: gl,
            resize: function () { var w = Math.round(canvas.clientWidth * DPR), h = Math.round(canvas.clientHeight * DPR); if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); } },
            f1: function (n, v) { gl.uniform1f(u(n), v); },
            f2: function (n, a, c) { gl.uniform2f(u(n), a, c); },
            i1: function (n, v) { gl.uniform1i(u(n), v); },
            draw: function () { gl.drawArrays(gl.TRIANGLES, 0, 3); }
        };
    }
    function texture(gl, unit, img) {
        var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function loadImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.decoding = 'async'; i.onload = function () { ok(i); }; i.onerror = ko; i.src = src; }); }
    function visibleLoop(el, frame) {
        var on = false, raf = 0;
        function tick(t) { frame(t / 1000); if (on) raf = requestAnimationFrame(tick); }
        new IntersectionObserver(function (es) { var v = es[0].isIntersecting; if (v && !on) { on = true; raf = requestAnimationFrame(tick); } else if (!v) { on = false; cancelAnimationFrame(raf); } }, { rootMargin: '80px' }).observe(el);
        document.addEventListener('visibilitychange', function () { if (document.hidden) { on = false; cancelAnimationFrame(raf); } });
        return { kick: function () { if (!on) frame(performance.now() / 1000); } };
    }
    function canvasSize(cv) { var W = Math.round(cv.clientWidth * DPR), H = Math.round(cv.clientHeight * DPR); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } return [W, H]; }

    /* =========================================================
       01 · CUARTO OSCURO — la luz proyecta tu obra sobre el retrato
       ========================================================= */
    var DARK = [
        'uniform sampler2D por; uniform sampler2D a0; uniform sampler2D a1;',
        'uniform vec2 r; uniform vec2 m; uniform float rad, lit, mixA, t, pa, cell;',
        'vec3 cover(sampler2D s, vec2 uv){ return texture2D(s, uv).rgb; }',
        'void main(){',
        '  vec2 p = gl_FragCoord.xy; vec2 uv = p / r;',
        // retrato: object-fit contain, anclado abajo
        '  float ca = r.x / r.y; vec2 puv = uv; float s;',
        '  if (ca > pa) { s = pa / ca; puv.x = (uv.x - .5) / s + .5; } else { s = ca / pa; puv.y = uv.y / s; }',
        '  float inside = step(0., puv.x) * step(puv.x, 1.) * step(0., puv.y) * step(puv.y, 1.);',
        '  vec3 pc = texture2D(por, clamp(puv, 0., 1.)).rgb * inside;',
        '  float lum = dot(pc, vec3(.299, .587, .114));',
        // obra proyectada (cuadrada, cubre el lienzo), deriva lenta
        '  vec2 auv = (p - .5 * r) / max(r.x, r.y) + .5; auv += vec2(sin(t*.05), cos(t*.04)) * .03;',
        '  vec3 art = mix(cover(a0, auv), cover(a1, auv), mixA);',
        // haz de luz
        '  float d = distance(p, m) / rad;',
        '  float beam = clamp(max(smoothstep(1., 0., d), lit), 0., 1.); beam = beam * beam * (3. - 2. * beam);',
        // fuera del haz: trama de puntos del retrato
        '  vec2 g = mod(p, cell) - cell * .5;',
        '  float dotR = cell * .5 * sqrt(clamp(lum * 1.35, 0., 1.));',
        '  float dots = smoothstep(dotR + .7, dotR - .7, length(g));',
        '  vec3 dark = vec3(.86, .82, .95) * dots * .55;',
        // dentro del haz: la obra se proyecta sobre el cuerpo (luz * luminancia del retrato)
        '  float body = smoothstep(.04, .5, lum);',
        '  vec3 proj = art * (.26 + 1.4 * body) + pc * .35;',
        '  float ring = smoothstep(.05, 0., abs(d - 1.)) * .35 * (1. - lit);',
        '  vec3 col = mix(dark, proj, beam) + vec3(.6, .3, 1.) * ring;',
        '  gl_FragColor = vec4(col, 1.);',
        '}'
    ].join('\n');

    function darkRoom(wrap) {
        if (reduce) return;
        var canvas = document.createElement('canvas');
        canvas.className = 'darkroom-canvas'; canvas.setAttribute('aria-hidden', 'true');
        var st = glStage(canvas, DARK); if (!st) return;
        var gl = st.gl;
        var portraitSrc = wrap.getAttribute('data-portrait');
        var artSrcs = (wrap.getAttribute('data-art') || '').split(',').filter(Boolean);
        Promise.all([loadImg(portraitSrc)].concat(artSrcs.map(loadImg))).then(function (imgs) {
            var por = imgs[0], arts = imgs.slice(1);
            wrap.insertBefore(canvas, wrap.firstChild);
            wrap.classList.add('gl-on');
            texture(gl, 0, por);
            var artTex = arts.map(function (im, i) { return { im: im }; });
            var cur = 0, nxt = 1 % arts.length;
            texture(gl, 1, arts[cur]); texture(gl, 2, arts[nxt]);
            st.i1('por', 0); st.i1('a0', 1); st.i1('a1', 2);
            st.f1('pa', por.naturalWidth / por.naturalHeight);

            var mx = .5, my = .38, tx = mx, ty = my, last = -1e9, lit = 0, litT = 0, swapAt = 0, mixA = 0;
            function setP(e) { var b = canvas.getBoundingClientRect(); tx = (e.clientX - b.left) / b.width; ty = (e.clientY - b.top) / b.height; last = performance.now(); }
            wrap.addEventListener('pointermove', setP);
            wrap.addEventListener('pointerdown', setP);

            var btn = wrap.parentElement.querySelector('[data-light-toggle]');
            if (btn) {
                btn.hidden = false;
                btn.addEventListener('click', function () {
                    var on = btn.getAttribute('aria-pressed') !== 'true';
                    btn.setAttribute('aria-pressed', on); litT = on ? 1 : 0;
                    btn.textContent = on ? 'Apagar la luz' : 'Encender la luz';
                });
            }
            var t0 = performance.now() / 1000;
            visibleLoop(canvas, function (t) {
                st.resize();
                if (performance.now() - last > 2200) { tx = .5 + .3 * Math.cos(t * .33); ty = .42 + .26 * Math.sin(t * .47); }
                mx += (tx - mx) * .09; my += (ty - my) * .09;
                lit += (litT - lit) * .06;
                // cambio de obra cada 7 s
                var el = Math.max(0, t - t0);
                if (arts.length > 1) {
                    var phase = el % 7;
                    if (phase > 5.5) mixA = (phase - 5.5) / 1.5; else mixA = 0;
                    var idx = Math.floor(el / 7) % arts.length;
                    if (idx !== cur) { cur = idx; nxt = (cur + 1) % arts.length; gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, arts[cur]); gl.activeTexture(gl.TEXTURE2); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, arts[nxt]); mixA = 0; }
                }
                var W = canvas.width, H = canvas.height;
                st.f2('r', W, H); st.f2('m', mx * W, (1 - my) * H);
                st.f1('rad', Math.min(W, H) * (touch ? .42 : .34));
                st.f1('lit', lit); st.f1('mixA', mixA); st.f1('t', t); st.f1('cell', 6 * DPR);
                st.draw();
            });
        }).catch(function () { /* deja la imagen original */ });
    }

    /* =========================================================
       02 · CABINA ABIERTA — crossfader + beat
       ========================================================= */
    var VJ = [
        'uniform vec2 r; uniform float t, x, k, s, b;',
        'vec2 kal(vec2 p){float a=atan(p.y,p.x),l=length(p),N=6.;a=mod(a,6.28318/N);a=abs(a-3.14159/N);return l*vec2(cos(a),sin(a));}',
        'vec3 sol(vec2 p){float a=atan(p.y,p.x),l=length(p);float rays=.5+.5*sin(a*12.+t*1.2+l*2.);float rings=.5+.5*sin(l*16.-t*3.);',
        ' vec3 c=mix(vec3(1.,.32,.12),vec3(1.,.78,.22),rays);c*=mix(.18,1.,rings*smoothstep(1.4,.15,l));',
        ' c=mix(c,vec3(1.,.93,.7),smoothstep(.33+.05*b,.29+.05*b,l));return c;}',
        'vec3 marea(vec2 p){float w=sin(p.x*3.5+t)*.16+sin(p.x*8.-t*1.4)*.05;float y=p.y+w;float bands=.5+.5*sin(y*20.+t*2.2);',
        ' vec3 c=mix(vec3(.03,.06,.28),vec3(.05,.78,.82),bands);c=mix(c,vec3(.54,.17,.89),smoothstep(.3,.95,.5+.5*sin(y*2.6-t*.6)));return c*(.55+.6*bands);}',
        'vec3 scene(vec2 p){ if(k>.5) p=kal(p); p*=1.-.07*b; return mix(sol(p),marea(p),x); }',
        'void main(){ vec2 p=(2.*gl_FragCoord.xy-r)/r.y; float o=s*(.012+.03*b);',
        ' vec3 c=vec3(scene(p+vec2(o,0.)).r, scene(p).g, scene(p-vec2(o,0.)).b);',
        ' c*=.8+.55*b; c*=smoothstep(1.9,.4,length(p*vec2(.8,1.))); gl_FragColor=vec4(c,1.); }'
    ].join('\n');
    function cabina(root) {
        var cv = root.querySelector('canvas'); var st = glStage(cv, VJ); if (!st) return;
        var xf = root.querySelector('[data-xf]'), bk = root.querySelector('[data-kal]'), br = root.querySelector('[data-rgb]'), bs = root.querySelector('[data-snd]');
        var kal = 0, rgb = 1, ac = null, t0 = 0, sched = 0, nextBeat = 0, playing = false, beatIdx = 0, noiseBuf = null;
        var BPM = 120, SP = 60 / BPM, L;
        function toggle(btn, cb) { btn.addEventListener('click', function () { var v = btn.getAttribute('aria-pressed') !== 'true'; btn.setAttribute('aria-pressed', v); cb(v); L.kick(); }); }
        function kick(time) { var o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, time); o.frequency.exponentialRampToValueAtTime(42, time + .14); g.gain.setValueAtTime(.9, time); g.gain.exponentialRampToValueAtTime(.001, time + .32); o.connect(g).connect(ac.destination); o.start(time); o.stop(time + .34); }
        function hat(time) { if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * .1, ac.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } var src = ac.createBufferSource(); src.buffer = noiseBuf; var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; var g = ac.createGain(); g.gain.setValueAtTime(.18, time); g.gain.exponentialRampToValueAtTime(.001, time + .06); src.connect(f).connect(g).connect(ac.destination); src.start(time); src.stop(time + .07); }
        var notes = [55, 55, 65.4, 49];
        function bass(time, i) { var o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = notes[(i >> 2) % 4]; f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(.0001, time); g.gain.exponentialRampToValueAtTime(.16, time + .02); g.gain.exponentialRampToValueAtTime(.001, time + SP * .45); o.connect(f).connect(g).connect(ac.destination); o.start(time); o.stop(time + SP * .5); }
        function scheduler() { while (nextBeat < ac.currentTime + .12) { kick(nextBeat); hat(nextBeat + SP / 2); bass(nextBeat + SP / 2, beatIdx); nextBeat += SP; beatIdx++; } }
        L = visibleLoop(cv, function (t) {
            st.resize();
            var ph = playing ? ((ac.currentTime - t0) / SP) : t * 2;
            var b = reduce && !playing ? .2 : Math.exp(-(((ph % 1) + 1) % 1) * 5.5);
            st.f2('r', cv.width, cv.height); st.f1('t', reduce && !playing ? 2 : t); st.f1('x', +xf.value);
            st.f1('k', kal); st.f1('s', rgb); st.f1('b', b); st.draw();
        });
        xf.addEventListener('input', function () { L.kick(); });
        toggle(bk, function (v) { kal = v ? 1 : 0; });
        toggle(br, function (v) { rgb = v ? 1 : 0; });
        toggle(bs, function (v) {
            if (v) { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); t0 = ac.currentTime + .05; nextBeat = t0; beatIdx = 0; sched = setInterval(scheduler, 25); playing = true; } catch (e) { bs.setAttribute('aria-pressed', 'false'); } }
            else { clearInterval(sched); playing = false; }
        });
        new IntersectionObserver(function (es) { if (!es[0].isIntersecting && playing) { bs.click(); } }).observe(cv);
    }

    /* =========================================================
       03 · EQUILIBRIO — LPhanty sobre la cuerda floja
       ========================================================= */
    function equilibrio(root) {
        var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
        var read = root.querySelector('[data-held]'), bestEl = root.querySelector('[data-best]');
        var th = .05, om = 0, w = 0, wt = 0, held = 0, best = 0, gust = 0, nextGust = 2.5, fallen = 0, lastT = 0, msg = '';
        try { best = +localStorage.getItem('lph-best') || 0; } catch (e) {}
        function setW(cx) { var b = cv.getBoundingClientRect(); wt = Math.max(-1, Math.min(1, ((cx - b.left) / b.width - .5) * 2.4)); }
        cv.addEventListener('pointermove', function (e) { setW(e.clientX); });
        cv.addEventListener('pointerdown', function (e) { setW(e.clientX); if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); });
        cv.tabIndex = 0;
        cv.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { wt = Math.max(-1, wt - .25); e.preventDefault(); } if (e.key === 'ArrowRight') { wt = Math.min(1, wt + .25); e.preventDefault(); } });
        function flower(x, y, s, hue) { ctx.save(); ctx.translate(x, y); for (var i = 0; i < 7; i++) { ctx.rotate(Math.PI * 2 / 7); ctx.beginPath(); ctx.ellipse(0, -s * .55, s * .28, s * .55, 0, 0, Math.PI * 2); ctx.fillStyle = hue; ctx.fill(); } ctx.beginPath(); ctx.arc(0, 0, s * .3, 0, Math.PI * 2); ctx.fillStyle = '#1a1020'; ctx.fill(); ctx.restore(); }
        function draw(W, H, sag) {
            var g = ctx.createRadialGradient(W * .5, H * .3, 10, W * .5, H * .5, Math.max(W, H) * .7); g.addColorStop(0, '#1b1426'); g.addColorStop(1, '#050407'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            var px = W * .5, py = H * .66, S = Math.min(W, H) / 300;
            ctx.strokeStyle = '#d9d2e6'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.moveTo(-10, H * .58); ctx.quadraticCurveTo(px, py + sag * S * 14, W + 10, H * .58); ctx.stroke();
            if (gust) { ctx.fillStyle = 'rgba(255,122,61,' + Math.min(.6, Math.abs(gust) * .4) + ')'; ctx.font = (12 * S) + 'px Inter, sans-serif'; ctx.fillText(gust > 0 ? 'la cuerda empuja →' : '← la cuerda empuja', gust > 0 ? W * .6 : W * .06, H * .5); }
            ctx.save(); ctx.translate(px, py + sag * S * 14); ctx.rotate(th);
            ctx.fillStyle = '#b9b0c9'; ctx.fillRect(-14 * S, -46 * S, 9 * S, 46 * S); ctx.fillRect(4 * S, -46 * S, 9 * S, 46 * S);
            ctx.beginPath(); ctx.ellipse(0, -70 * S, 46 * S, 34 * S, 0, 0, Math.PI * 2); ctx.fillStyle = '#c9c1d8'; ctx.fill();
            ctx.beginPath(); ctx.arc(38 * S, -96 * S, 22 * S, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(26 * S, -96 * S, 14 * S, 19 * S, -.3, 0, Math.PI * 2); ctx.fillStyle = '#a99fbb'; ctx.fill();
            ctx.beginPath(); ctx.arc(46 * S, -100 * S, 2.6 * S, 0, Math.PI * 2); ctx.fillStyle = '#1a1020'; ctx.fill();
            var off = w * 36 * S, pl = 110 * S;
            ctx.strokeStyle = '#c9c1d8'; ctx.lineWidth = 8 * S; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(54 * S, -92 * S); ctx.quadraticCurveTo(66 * S, -60 * S, 52 * S, -40 * S); ctx.stroke();
            ctx.strokeStyle = '#8a2be2'; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.moveTo(52 * S - pl + off, -40 * S); ctx.lineTo(52 * S + pl + off, -40 * S); ctx.stroke();
            flower(52 * S - pl + off, -40 * S, 15 * S, '#ff7a3d'); flower(52 * S + pl + off, -40 * S, 15 * S, '#19c3c9');
            ctx.restore();
            if (msg) { ctx.fillStyle = '#f5f5f5'; ctx.font = '700 ' + (17 * S) + 'px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H * .2); ctx.textAlign = 'left'; }
        }
        visibleLoop(cv, function (t) {
            var sz = canvasSize(cv), W = sz[0], H = sz[1];
            var dt = Math.min(.033, Math.max(0, t - lastT)); lastT = t; if (reduce) dt *= .6;
            w += (wt - w) * Math.min(1, dt * 8);
            if (fallen > 0) { fallen -= dt; th += (th >= 0 ? 1 : -1) * dt * 2.2; if (fallen <= 0) { th = (Math.random() - .5) * .1; om = 0; held = 0; msg = ''; } }
            else {
                nextGust -= dt; if (nextGust <= 0) { gust = (Math.random() < .5 ? -1 : 1) * (.9 + Math.random() * .9); nextGust = 2.2 + Math.random() * 2.8; }
                var acc = 1.7 * Math.sin(th) - 4.2 * w - 1.3 * om + gust * 1.05;
                gust *= Math.pow(.25, dt); if (Math.abs(gust) < .05) gust = 0;
                om += acc * dt; th += om * dt; held += dt;
                if (Math.abs(th) > .95) { fallen = 1.4; msg = 'Se cayó. Vuelve a intentarlo.'; if (held > best) { best = held; try { localStorage.setItem('lph-best', best.toFixed(1)); } catch (e) {} } }
            }
            read.textContent = 'En equilibrio ' + held.toFixed(1) + ' s';
            bestEl.textContent = 'Récord ' + Math.max(best, fallen > 0 ? 0 : held).toFixed(1) + ' s';
            draw(W, H, Math.sin(t * 2.1) * .5 + om * .3);
        });
    }

    /* =========================================================
       04 · PAUSA — un minuto de respiración guiada
       ========================================================= */
    function pausa(root) {
        var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
        var word = root.querySelector('[data-word]'), cnt = root.querySelector('[data-count]'), btn = root.querySelector('[data-start]');
        var PH = ['Inhala', 'Sostén', 'Exhala'], CYCLE = 14, TOTAL = 4, start = -1, lastWord = '', L;
        btn.addEventListener('click', function () {
            if (start >= 0) { start = -1; btn.textContent = 'Empezar · 1 minuto'; word.textContent = 'Respira'; cnt.textContent = 'Ciclo 0 / ' + TOTAL; }
            else { start = performance.now() / 1000; btn.textContent = 'Detener'; }
            L.kick();
        });
        function level(e) { var c = e % CYCLE; if (c < 4) return .5 - .5 * Math.cos(Math.PI * c / 4); if (c < 8) return 1; return .5 + .5 * Math.cos(Math.PI * (c - 8) / 6); }
        L = visibleLoop(cv, function (t) {
            var sz = canvasSize(cv), W = sz[0], H = sz[1];
            var lv = .35 + .08 * Math.sin(t * .8), e;
            if (start >= 0) {
                e = t - start;
                if (e >= CYCLE * TOTAL) { start = -1; btn.textContent = 'Otra vez'; word.textContent = 'Gracias'; cnt.textContent = 'Ciclo ' + TOTAL + ' / ' + TOTAL; }
                else { lv = level(e); var c = e % CYCLE; var wd = c < 4 ? PH[0] : c < 8 ? PH[1] : PH[2]; if (wd !== lastWord) { word.textContent = wd; lastWord = wd; } cnt.textContent = 'Ciclo ' + (Math.floor(e / CYCLE) + 1) + ' / ' + TOTAL; }
            }
            ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
            var cx = W / 2, cy = H / 2, R = Math.min(W, H) * (.16 + .2 * lv);
            for (var layer = 3; layer >= 0; layer--) {
                ctx.beginPath(); var rr = R * (1 + layer * .22), N = 90;
                for (var i = 0; i <= N; i++) { var a = i / N * Math.PI * 2; var wob = 1 + .04 * Math.sin(a * 3 + t * .9 + layer) + .03 * Math.sin(a * 5 - t * 1.3 + layer * 2); var x = cx + Math.cos(a) * rr * wob, y = cy + Math.sin(a) * rr * wob; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
                var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.1), al = layer === 0 ? .95 : .18 / layer;
                g.addColorStop(0, 'rgba(255,170,110,' + al + ')'); g.addColorStop(.55, 'rgba(138,43,226,' + al + ')'); g.addColorStop(1, 'rgba(25,195,201,' + (al * .6) + ')');
                ctx.fillStyle = g; ctx.fill();
            }
            for (var k = 0; k < 40; k++) { var an = k * 2.399 + t * .05 * (k % 3 + 1), d = R * (1.5 + (k % 7) * .14) * (1 + .15 * lv); ctx.fillStyle = 'rgba(245,245,245,' + (.15 + .25 * ((k * 37) % 10) / 10) + ')'; ctx.fillRect(cx + Math.cos(an) * d, cy + Math.sin(an) * d, 2 * DPR, 2 * DPR); }
        });
    }

    /* ---------- arranque ---------- */
    function init() {
        document.querySelectorAll('[data-darkroom]').forEach(darkRoom);
        document.querySelectorAll('[data-cabina]').forEach(cabina);
        document.querySelectorAll('[data-equilibrio]').forEach(equilibrio);
        document.querySelectorAll('[data-pausa]').forEach(pausa);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
