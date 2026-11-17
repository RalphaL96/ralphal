/* Ralpha L. — LPhanty en AR, con tu mano
   La escultura completa (cuerda, postes y margaritas) a escala real delante de la cámara trasera.
   El giroscopio la mantiene fija en tu espacio mientras mueves el teléfono (3DoF, funciona en iPhone).
   Un detector de manos (MediaPipe, en el navegador) sigue tus dedos: si los acercas al elefante
   o a una margarita, lo empujas y se balancea sobre la cuerda con la misma física de la web. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_HAND = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const V = document.querySelector('script[src*="mano.js"]')?.src.split('v=')[1] || '1';
const EYE = 1.3;          // altura del teléfono sobre el piso (m)
const K = 0.155;          // metros por unidad de la física de la web
const PIVOT_Y = 1.0;      // la cuerda está a 1 m del piso
const TIPS = [4, 8, 12, 16, 20, 9];

let busy = false;
async function abrir(modelUrl) {
    if (busy) return; busy = true;

    // El permiso del giroscopio en iPhone tiene que pedirse dentro del toque, antes de cualquier espera.
    let orientOk = false;
    const permiso = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')
        ? DeviceOrientationEvent.requestPermission().then(r => r === 'granted').catch(() => false)
        : Promise.resolve(true);

    const ov = document.createElement('div');
    ov.className = 'mano-overlay';
    ov.innerHTML = `
        <video class="mano-video" playsinline muted autoplay></video>
        <canvas class="mano-canvas"></canvas>
        <div class="mano-dots">${TIPS.map(() => '<i></i>').join('')}</div>
        <div class="ar-top"><span class="ar-title">LPhanty · AR con tu mano</span>
            <div class="mano-actions"><button type="button" class="ar-close" data-place>Recolocar</button><button type="button" class="ar-close" data-close>Cerrar</button></div></div>
        <div class="mano-hud"><b data-status>Preparando la cámara…</b><span data-score></span></div>`;
    document.body.appendChild(ov); document.body.classList.add('sense-lock');
    const video = ov.querySelector('video'), canvas = ov.querySelector('canvas');
    const dots = [...ov.querySelectorAll('.mano-dots i')];
    const statusEl = ov.querySelector('[data-status]'), scoreEl = ov.querySelector('[data-score]');
    const say = (t) => { if (statusEl.textContent !== t) statusEl.textContent = t; };

    let stream = null, raf = 0, closed = false, landmarker = null;
    const onOrient = (e) => { if (e.alpha != null || e.beta != null) { orient = e; orientOk = true; } };
    let orient = null;
    const cerrar = () => {
        closed = true; cancelAnimationFrame(raf);
        window.removeEventListener('deviceorientation', onOrient); window.removeEventListener('resize', resize);
        if (stream) stream.getTracks().forEach(t => t.stop());
        try { landmarker && landmarker.close(); } catch (e) {}
        renderer.dispose(); ov.remove(); document.body.classList.remove('sense-lock'); busy = false;
    };
    ov.querySelector('[data-close]').addEventListener('click', cerrar);

    // ---------- escena ----------
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x302040, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(1, 3, 2); scene.add(key);
    const cam = new THREE.PerspectiveCamera(65, 1, 0.05, 50);
    scene.add(cam);

    const world = new THREE.Group(); scene.add(world); world.visible = false;      // piso virtual: y = -EYE
    const pivot = new THREE.Group(); pivot.position.y = PIVOT_Y; world.add(pivot);   // gira sobre la cuerda (eje z)

    // sombra de contacto
    const sh = document.createElement('canvas'); sh.width = sh.height = 128;
    const sx = sh.getContext('2d'), gr = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
    const shTex = new THREE.CanvasTexture(sh);
    const shadow = (w, d, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.002, z); world.add(m); return m; };
    shadow(0.5, 0.5, 0.75); shadow(0.5, 0.5, -0.75);
    const swingShadow = shadow(1.1, 0.7, 0);

    let elephantMat = null;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(modelUrl, (g) => {
        world.add(g.scene); g.scene.updateMatrixWorld(true); pivot.updateMatrixWorld(true);
        const fijo = /^(Cuerda|Poste|Base)/;
        [...g.scene.children].forEach(o => { if (!fijo.test(o.name)) pivot.attach(o); });
        pivot.traverse(o => { if (o.material && o.material.name === 'Violeta') { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x8a2be2); o.material.emissiveIntensity = 0; elephantMat = o.material; } });
    });

    // ---------- física (igual que en la web, en sus unidades) ----------
    const G = 9.8, DAMP = 0.3, FALL = 1.95;
    const bodies = [{ m: 1.0, x: 0, y: 0.74, r: 0.85 }, { m: 0.5, x: 0, y: 0.07, r: 0 }, { m: 0.8, x: -2.25, y: -1.5, r: 0.62 }, { m: 0.8, x: 2.25, y: -1.5, r: 0.62 }];
    const I = bodies.reduce((s, b) => s + b.m * (b.x * b.x + b.y * b.y), 0.3);
    let theta = 0, omega = 0, state = 'idle', fallT = 0, fallY = 0, fallV = 0, peak = 0, best = 0, glow = 0, pushes = 0, touching = false;
    try { best = +localStorage.getItem('lph-ar-best') || 0; } catch (e) {}
    const torque = (th) => { const c = Math.cos(th), s = Math.sin(th); let t = 0; for (const b of bodies) t -= b.m * G * (b.x * c - b.y * s); return t; };

    // ---------- tamaño y campo de visión ----------
    let W = 0, H = 0;
    const FOV_LARGO = 69;   // cámara principal del iPhone, lado largo del cuadro
    function resize() {
        W = ov.clientWidth; H = ov.clientHeight;
        renderer.setSize(W, H, false);
        const vw = video.videoWidth || 720, vh = video.videoHeight || 1280;
        const k = Math.max(W / vw, H / vh);
        const tl = Math.tan(FOV_LARGO * Math.PI / 360);
        const tv = vh >= vw ? tl : tl * vh / vw;               // tangente de medio fov vertical del video
        cam.fov = 2 * Math.atan(tv * H / (vh * k)) * 180 / Math.PI;
        cam.aspect = W / H; cam.updateProjectionMatrix();
    }
    resize(); window.addEventListener('resize', resize);

    // ---------- orientación del teléfono → cámara ----------
    const euler = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), zee = new THREE.Vector3(0, 0, 1);
    function updateCam() {
        if (!orient) return;
        const d = Math.PI / 180, so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        euler.set((orient.beta || 0) * d, (orient.alpha || 0) * d, -(orient.gamma || 0) * d, 'YXZ');
        cam.quaternion.setFromEuler(euler); cam.quaternion.multiply(q1); cam.quaternion.multiply(q0.setFromAxisAngle(zee, -so * d));
    }

    // Coloca la escultura donde mira el centro de la pantalla, sobre el piso virtual.
    let yaw = -0.6;
    function colocar() {
        updateCam(); cam.updateMatrixWorld();
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const h = new THREE.Vector3(f.x, 0, f.z); if (h.lengthSq() < 1e-4) h.set(0, 0, -1); h.normalize();
        let dist = 2.2; if (f.y < -0.25) dist = Math.min(3, Math.max(1.1, EYE / -f.y * Math.hypot(f.x, f.z)));
        world.position.set(h.x * dist, -EYE, h.z * dist);
        world.rotation.y = Math.atan2(-h.x, -h.z) + yaw;
        world.visible = true;
        theta = 0; omega = 0; fallY = 0; state = 'play'; peak = 0;
    }
    ov.querySelector('[data-place]').addEventListener('click', colocar);

    // girar con un dedo, tocar para empujar (por si la mano no se detecta)
    let drag = null;
    canvas.style.pointerEvents = 'auto'; canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return; const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 8) drag.moved = true;
        if (drag.moved) { world.rotation.y += dx * 0.01; yaw += dx * 0.01; drag.x = e.clientX; }
    });
    canvas.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved && state === 'play') {
            const p = proyecta(e.clientX, e.clientY);
            if (p && Math.hypot(p.x - Math.sin(theta) * -0.74, p.y - Math.cos(theta) * 0.74) < 1.6) { omega += (p.x < -Math.sin(theta) * 0.74 ? -1 : 1) * 0.7; pushes++; }
        }
        drag = null;
    });

    // ---------- pantalla → plano de balanceo (unidades de la física) ----------
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(), tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), inv = new THREE.Matrix4();
    function proyecta(x, y) {
        pivot.updateWorldMatrix(true, false);
        nrm.set(0, 0, 1).transformDirection(pivot.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(nrm, tmp.setFromMatrixPosition(pivot.matrixWorld));
        ray.setFromCamera({ x: x / W * 2 - 1, y: -(y / H) * 2 + 1 }, cam);
        // la cuerda corre de frente a fondo: si se mira casi de lado, usa un plano frente a la cámara
        if (Math.abs(ray.ray.direction.dot(nrm)) < 0.35) plane.setFromNormalAndCoplanarPoint(tmp.copy(ray.ray.direction).negate(), new THREE.Vector3().setFromMatrixPosition(pivot.matrixWorld));
        const hit = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!hit) return null;
        inv.copy(pivot.parent.matrixWorld).invert(); hit.applyMatrix4(inv);       // al marco del mundo de la pieza
        return { x: hit.x / K, y: (hit.y - PIVOT_Y) / K };
    }

    // ---------- cámara y detector ----------
    try {
        say('Cargando el detector de manos…');
        const { FilesetResolver, HandLandmarker } = await import('/vendor/mediapipe/vision_bundle.mjs');
        const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
        const opts = (delegate) => ({ baseOptions: { modelAssetPath: window.RALPHAL_HAND_MODEL || MODEL_HAND, delegate }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        try { landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
        catch (e) { landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
        say('Abriendo la cámara…');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream; await video.play().catch(() => {});
        await new Promise(r => video.readyState >= 1 ? r() : video.addEventListener('loadedmetadata', r, { once: true }));
        resize();
    } catch (e) {
        console.warn(e); say('No pudimos abrir la cámara o el detector. Revisa el permiso del navegador.'); return;
    }
    if (closed) return;
    if (await permiso) window.addEventListener('deviceorientation', onOrient);
    await new Promise(r => setTimeout(r, 350));
    colocar();
    if (!orientOk) say('Sin giroscopio: la pieza queda fija en la pantalla');

    function toScreen(lm) {
        const vw = video.videoWidth || 720, vh = video.videoHeight || 1280;
        const k = Math.max(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
        return { x: ox + lm.x * vw * k, y: oy + lm.y * vh * k };
    }

    // ---------- bucle ----------
    let lastT = 0, lastVideoTime = -1, prev = [], handT = -1, sinMano = 0;
    function frame(ms) {
        if (closed) return;
        const t = ms / 1000, dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
        updateCam();

        // dedos → puntos en el plano de balanceo, con su velocidad
        let pts = null;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const r = landmarker.detectForVideo(video, ms);
            const hand = (r && r.landmarks && r.landmarks[0]) || (window.RALPHAL_FAKE_HAND && window.RALPHAL_FAKE_HAND(t));
            if (hand) {
                const hdt = handT > 0 ? Math.max(0.016, t - handT) : 0.033; handT = t; sinMano = 0;
                pts = TIPS.map((i, j) => {
                    const s = toScreen(hand[i]), p = proyecta(s.x, s.y);
                    dots[j].style.transform = `translate(${s.x}px,${s.y}px)`; dots[j].style.opacity = 1;
                    if (!p) return null;
                    const q = prev[j]; p.vx = q ? (p.x - q.x) / hdt : 0; p.vy = q ? (p.y - q.y) / hdt : 0;
                    return p;
                });
                prev = pts;
            } else { sinMano += dt; if (sinMano > 0.3) { prev = []; dots.forEach(d => d.style.opacity = 0); } }
        }

        if (state === 'play') {
            // contacto: cada dedo dentro de un cuerpo lo empuja (posición + velocidad)
            let near = 9; touching = false;
            const c = Math.cos(theta), s = Math.sin(theta);
            if (pts) for (const p of pts) {
                if (!p) continue;
                for (const b of bodies) {
                    if (!b.r) continue;
                    const bx = b.x * c - b.y * s, by = b.x * s + b.y * c;
                    const dx = p.x - bx, dy = p.y - by, d = Math.hypot(dx, dy);
                    near = Math.min(near, d - b.r);
                    if (d < b.r) {
                        touching = true;
                        // velocidad del dedo convertida en giro alrededor de la cuerda
                        const r2 = bx * bx + by * by || 1;
                        const wFinger = (bx * p.vy - by * p.vx) / r2;
                        const pen = (b.r - d) / b.r;
                        const pushW = -(bx * dy - by * dx) / r2 * pen * 6;   // te aparta del dedo
                        const target = Math.max(-4, Math.min(4, wFinger * 0.9 + pushW));
                        if (Math.abs(target) > Math.abs(omega) || Math.sign(target) !== Math.sign(omega)) omega += (target - omega) * 0.35;
                    }
                }
            }
            if (touching && !wasTouching) pushes++;
            wasTouching = touching;
            glow += ((touching ? 1 : near < 0.9 ? 0.45 : 0) - glow) * 0.2;

            const steps = 4, h = dt / steps;
            for (let i = 0; i < steps; i++) { const a = torque(theta) / I - DAMP * omega; omega += a * h; theta += omega * h; }
            peak = Math.max(peak, Math.abs(theta));
            if (peak > best) { best = peak; }
            if (Math.abs(theta) > FALL) { state = 'fall'; fallT = 0; fallV = 0; try { localStorage.setItem('lph-ar-best', best.toFixed(3)); } catch (e) {} }
            const deg = Math.round(Math.abs(theta) * 57.3);
            say(touching ? '¡Lo estás empujando!' : !prev.length ? 'Acerca tu mano al elefante' : deg > 6 ? 'Se balancea ' + deg + '°' : 'Tócalo con los dedos para balancearlo');
        } else if (state === 'fall') {
            fallT += dt; fallV += 9.8 * dt; fallY = Math.max(-(PIVOT_Y - 0.12), fallY - fallV * dt); omega *= 0.97; theta += omega * dt; glow *= 0.9;
            say('Se cayó. Vuelve a colgarlo en un momento…');
            if (fallT > 2.2) { state = 'play'; theta = 0; omega = 0; fallY = 0; peak = 0; }
        }
        scoreEl.textContent = 'Balanceo ' + Math.round(Math.abs(theta) * 57.3) + '° · Récord ' + Math.round(best * 57.3) + '° · Empujones ' + pushes;

        pivot.rotation.z = theta; pivot.position.y = PIVOT_Y + fallY;
        swingShadow.scale.x = 1 + Math.abs(Math.sin(theta)) * 0.4; swingShadow.position.x = -Math.sin(theta) * 0.1;
        if (elephantMat) elephantMat.emissiveIntensity = glow * 0.55;
        renderer.render(scene, cam);
        raf = requestAnimationFrame(frame);
    }
    let wasTouching = false;
    raf = requestAnimationFrame(frame);
}

document.querySelectorAll('[data-mano-open]').forEach(b => b.addEventListener('click', () => { const m = b.getAttribute('data-model'); abrir(m.includes('?') ? m : m + '?v=' + V); }));
