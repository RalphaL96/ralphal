/* Ralpha L. — Experimento 05 · LPhanty en tu mano
   La cámara detecta tu mano (MediaPipe) y LPhanty se sienta en la punta de tu índice.
   Las margaritas bajan su centro de masa: si mueves la mano con calma, se mantiene; si la sacudes, cae. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_HAND = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const V = document.querySelector('script[src*="mano.js"]')?.src.split('v=')[1] || '1';

let busy = false;
async function abrir(modelUrl) {
    if (busy) return; busy = true;
    const ov = document.createElement('div');
    ov.className = 'mano-overlay';
    ov.innerHTML = `
        <video class="mano-video" playsinline muted autoplay></video>
        <canvas class="mano-canvas"></canvas>
        <div class="ar-top"><span class="ar-title">LPhanty en tu mano</span>
            <div class="mano-actions"><button type="button" class="ar-close" data-flip>Cambiar cámara</button><button type="button" class="ar-close" data-close>Cerrar</button></div></div>
        <div class="mano-hud"><b data-status>Preparando la cámara…</b><span data-score></span></div>`;
    document.body.appendChild(ov); document.body.classList.add('sense-lock');
    const video = ov.querySelector('video'), canvas = ov.querySelector('canvas');
    const statusEl = ov.querySelector('[data-status]'), scoreEl = ov.querySelector('[data-score]');
    const say = (t) => { if (statusEl.textContent !== t) statusEl.textContent = t; };

    let stream = null, facing = 'user', raf = 0, closed = false, landmarker = null;
    async function startCam() {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream; await video.play().catch(() => {});
        ov.classList.toggle('mirror', facing === 'user');
    }
    const cerrar = () => {
        closed = true; cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(t => t.stop());
        try { landmarker && landmarker.close(); } catch (e) {}
        renderer.dispose(); ov.remove(); document.body.classList.remove('sense-lock'); busy = false;
    };
    ov.querySelector('[data-close]').addEventListener('click', cerrar);
    ov.querySelector('[data-flip]').addEventListener('click', async () => { facing = facing === 'user' ? 'environment' : 'user'; try { await startCam(); } catch (e) {} });

    // escena
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x302040, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.4, 1, 1); scene.add(key);
    const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000);
    const holder = new THREE.Group(), tilt = new THREE.Group(); holder.add(tilt); scene.add(holder);
    holder.visible = false;

    let W = 0, H = 0;
    function resize() {
        W = ov.clientWidth; H = ov.clientHeight;
        renderer.setSize(W, H, false);
        cam.left = 0; cam.right = W; cam.top = H; cam.bottom = 0; cam.updateProjectionMatrix();
    }
    resize(); window.addEventListener('resize', resize);

    // física: el mismo cuerpo rígido que en la web, con el pivote en la punta del dedo
    const G = 9.8, DAMP = 0.35, FALL = 1.95;
    const bodies = [{ m: 1.0, x: 0, y: 0.74 }, { m: 0.5, x: 0, y: 0.07 }, { m: 0.8, x: -2.25, y: -1.5 }, { m: 0.8, x: 2.25, y: -1.5 }];
    const I = bodies.reduce((s, b) => s + b.m * (b.x * b.x + b.y * b.y), 0.3);
    let theta = 0, omega = 0, state = 'wait', held = 0, best = 0, lostT = 0, fallT = 0, fallV = 0, appear = 0;
    try { best = +localStorage.getItem('lph-mano-best') || 0; } catch (e) {}
    let tip = null, pos = null, vel = { x: 0, y: 0 }, acc = { x: 0, y: 0 }, scale = 60, lastT = 0;

    function torque(th, gx, gy) {
        const c = Math.cos(th), s = Math.sin(th); let t = 0;
        for (const b of bodies) { const xr = b.x * c - b.y * s, yr = b.x * s + b.y * c; t += b.m * (xr * gy - yr * gx); }
        return t;
    }

    // modelo
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(modelUrl, (g) => { tilt.add(g.scene); tilt.rotation.y = 0.35; });

    // detector de manos
    try {
        say('Cargando el detector de manos…');
        const { FilesetResolver, HandLandmarker } = await import('/vendor/mediapipe/vision_bundle.mjs');
        const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
        landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: window.RALPHAL_HAND_MODEL || MODEL_HAND, delegate: 'GPU' },
            runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5
        });
        await startCam();
    } catch (e) {
        console.warn(e); say('No pudimos abrir la cámara o el detector. Revisa el permiso del navegador.'); return;
    }
    if (closed) return;

    function toScreen(lm) {
        const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
        const k = Math.max(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
        let x = ox + lm.x * vw * k; const y = oy + lm.y * vh * k;
        if (facing === 'user') x = W - x;
        return { x, y: H - y };
    }

    let lastVideoTime = -1;
    function frame(ms) {
        if (closed) return;
        const t = ms / 1000, dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
        let hand = null;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const r = landmarker.detectForVideo(video, ms);
            hand = r && r.landmarks && r.landmarks[0];
            if (hand) {
                const p8 = toScreen(hand[8]), p0 = toScreen(hand[0]), p9 = toScreen(hand[9]);
                const size = Math.hypot(p0.x - p9.x, p0.y - p9.y);
                scale += (Math.max(18, size * 0.3) - scale) * 0.25;
                tip = p8; lostT = 0;
            } else lostT += dt;
        } else if (tip) { hand = true; }
        if (window.RALPHAL_FAKE_TIP) { tip = window.RALPHAL_FAKE_TIP(t, W, H); hand = true; lostT = 0; scale = Math.min(W, H) * 0.09; }

        // posición suavizada, velocidad y aceleración (en unidades del modelo)
        if (tip) {
            if (!pos) pos = { x: tip.x, y: tip.y };
            const nx = pos.x + (tip.x - pos.x) * 0.6, ny = pos.y + (tip.y - pos.y) * 0.6;
            const vx = (nx - pos.x) / dt, vy = (ny - pos.y) / dt;
            const ax = (vx - vel.x) / dt, ay = (vy - vel.y) / dt;
            acc.x += (ax - acc.x) * 0.3; acc.y += (ay - acc.y) * 0.3;
            vel = { x: vx, y: vy }; pos = { x: nx, y: ny };
        }
        const present = tip && lostT < 0.5;

        if (state === 'wait') {
            holder.visible = false; say(present ? 'Mantén el índice quieto…' : 'Muestra tu mano frente a la cámara, con el índice hacia arriba');
            if (present) { appear += dt; if (appear > 0.6) { state = 'play'; theta = (Math.random() - 0.5) * 0.2; omega = 0; held = 0; appear = 0; } }
            else appear = 0;
        } else if (state === 'play') {
            if (!present) { state = 'wait'; }
            else {
                const clamp = (v) => Math.max(-40, Math.min(40, v));
                const ax = clamp(acc.x / scale), ay = clamp(acc.y / scale);
                const gx = -ax, gy = -G - ay;               // gravedad efectiva en el marco del dedo
                const steps = 4, h = dt / steps;
                for (let i = 0; i < steps; i++) { const a = torque(theta, gx, gy) / I - DAMP * omega; omega += a * h; theta += omega * h; }
                held += dt;
                if (held > best) { best = held; }
                if (Math.abs(theta) > FALL) { state = 'fall'; fallT = 0; fallV = 0; try { localStorage.setItem('lph-mano-best', best.toFixed(1)); } catch (e) {} }
                say(Math.abs(theta) < 0.08 ? 'En equilibrio sobre tu dedo' : 'Se balancea ' + Math.round(Math.abs(theta) * 57.3) + '°');
            }
        } else if (state === 'fall') {
            fallT += dt; fallV += 900 * dt; omega *= 0.99; theta += omega * dt;
            say('Se cayó. Vuelve a poner el índice.');
            if (fallT > 1.4) { state = 'wait'; }
        }
        scoreEl.textContent = 'En equilibrio ' + held.toFixed(1) + ' s · Récord ' + best.toFixed(1) + ' s';

        if (pos && state !== 'wait') {
            holder.visible = true;
            const drop = state === 'fall' ? -fallV * fallT * 0.5 : 0;
            holder.position.set(pos.x, pos.y + drop, 0);
            holder.scale.setScalar(scale);
            holder.rotation.z = theta;
        }
        renderer.render(scene, cam);
        raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
}

document.querySelectorAll('[data-mano-open]').forEach(b => b.addEventListener('click', () => abrir(b.getAttribute('data-model') + '?v=' + V)));
