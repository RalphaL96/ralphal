/* Ralpha L. — LPhanty · Equilibrio 3D
   El elefante cuelga de la cuerda floja. Las dos margaritas bajan su centro de masa y lo mantienen en pie.
   Quita una y se inclina; quita las dos y cae. Se empuja con el cursor o el dedo y se inclina con el teléfono. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function init(root) {
    const stage = root.querySelector('.eq3d-stage');
    const status = root.querySelector('[data-eq-status]');
    const btnL = root.querySelector('[data-flower="izq"]');
    const btnR = root.querySelector('[data-flower="der"]');
    const btnTilt = root.querySelector('[data-tilt]');
    const btnReset = root.querySelector('[data-reset]');
    const poster = root.querySelector('.eq3d-poster');

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { root.classList.add('eq3d-nogl'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'eq3d-canvas';
    renderer.domElement.setAttribute('aria-label', 'LPhanty en 3D sobre la cuerda floja. Arrastra para empujarlo.');
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 10, 24);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const key = new THREE.SpotLight(0xffffff, 60, 30, Math.PI / 5, 0.5, 1.2);
    key.position.set(2.5, 6, 6); key.target.position.set(0, -1, 0); scene.add(key, key.target);
    const rim = new THREE.PointLight(0x8a2be2, 30, 14, 1.5); rim.position.set(-3.5, 1.5, -3); scene.add(rim);
    const fill = new THREE.PointLight(0x7cd321, 10, 12, 1.6); fill.position.set(3.5, -3, 2.5); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1020, 0.6));

    // cuerda: a lo largo del eje Z, pasa por el pivote
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.3 });
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 26, 12), ropeMat);
    rope.rotation.x = Math.PI / 2; scene.add(rope);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    const camTarget = new THREE.Vector3(0, -0.85, 0);

    // figura que gira sobre la cuerda
    const swing = new THREE.Group(); scene.add(swing);
    const parts = { izq: [], der: [] };

    // física: cuerpo rígido que gira alrededor de la cuerda (eje Z)
    const G = 9.8, DAMP = 0.32;
    const bodies = {
        elefante: { m: 1.0, x: 0, y: 0.27, on: true },
        tallos: { m: 0.5, x: 0, y: -0.4, on: true },
        izq: { m: 0.8, x: -2.25, y: -1.97, on: true },
        der: { m: 0.8, x: 2.25, y: -1.97, on: true }
    };
    let theta = reduce ? 0 : 0.12, omega = 0, fallen = false, fallY = 0, fallV = 0, fallT = 0;
    let phi = 0, phiTarget = 0, tiltOn = false;
    let nextGust = 3 + Math.random() * 3;

    function inertia() {
        let I = 0.3; for (const k in bodies) { const b = bodies[k]; if (b.on) I += b.m * (b.x * b.x + b.y * b.y); } return I;
    }
    function torque(th) {
        const c = Math.cos(th - phi), s = Math.sin(th - phi); let t = 0;
        for (const k in bodies) { const b = bodies[k]; if (!b.on) continue; const xr = b.x * c - b.y * s; t += -G * b.m * xr; }
        return t;
    }
    function equilibrium() {
        // ángulo donde el centro de masa queda bajo la cuerda
        let mx = 0, my = 0; for (const k in bodies) { const b = bodies[k]; if (b.on) { mx += b.m * b.x; my += b.m * b.y; } }
        return { mx, my, stable: my < -0.05 };
    }
    function say(text) { if (status && status.textContent !== text) status.textContent = text; }
    function describe() {
        if (fallen) return say('Se cayó. Sin lo que nos formó, no hay equilibrio.');
        const deg = Math.round(Math.abs(theta * 180 / Math.PI));
        const eq = equilibrium();
        if (!bodies.izq.on && !bodies.der.on) return say('Sin flores: el equilibrio se pierde…');
        if (!bodies.izq.on || !bodies.der.on) return say('Con una sola flor se inclina ' + deg + '°');
        say(deg < 4 ? 'En equilibrio' : 'Se balancea ' + deg + '°');
    }

    // interacción: arrastrar empuja
    let dragging = false, lastX = 0, lastT = 0;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastT = performance.now(); el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
        if (!dragging || fallen) return;
        const now = performance.now(), dx = e.clientX - lastX, dt = Math.max(8, now - lastT);
        omega += (dx / dt) * 0.9 / Math.max(1, inertia() / 6);
        lastX = e.clientX; lastT = now;
    });
    const end = () => { dragging = false; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.tabIndex = 0;
    el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { omega -= 0.6; e.preventDefault(); }
        if (e.key === 'ArrowRight') { omega += 0.6; e.preventDefault(); }
    });

    function setFlower(side, on) {
        bodies[side].on = on;
        parts[side].forEach(o => { o.visible = on; });
        const b = side === 'izq' ? btnL : btnR; if (b) b.setAttribute('aria-pressed', on);
        omega += on ? 0 : (side === 'izq' ? 0.15 : -0.15);
    }
    btnL?.addEventListener('click', () => { if (!fallen) setFlower('izq', !bodies.izq.on); });
    btnR?.addEventListener('click', () => { if (!fallen) setFlower('der', !bodies.der.on); });
    function reset() {
        fallen = false; fallY = 0; fallV = 0; theta = 0.18; omega = 0; swing.position.set(0, 0, 0);
        setFlower('izq', true); setFlower('der', true);
    }
    btnReset?.addEventListener('click', reset);

    // inclinación del teléfono
    function onOrient(e) {
        if (e.gamma == null) return;
        const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        let g = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
        g = Math.max(-50, Math.min(50, g || 0));
        phiTarget = -g * Math.PI / 180;
    }
    if (btnTilt) {
        const canTilt = 'DeviceOrientationEvent' in window && window.matchMedia('(pointer: coarse)').matches;
        btnTilt.hidden = !canTilt;
        btnTilt.addEventListener('click', async () => {
            if (tiltOn) { window.removeEventListener('deviceorientation', onOrient); tiltOn = false; phiTarget = 0; btnTilt.setAttribute('aria-pressed', 'false'); btnTilt.textContent = 'Inclinar con el teléfono'; return; }
            try {
                if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                    const r = await DeviceOrientationEvent.requestPermission();
                    if (r !== 'granted') { btnTilt.textContent = 'Permiso denegado'; return; }
                }
                window.addEventListener('deviceorientation', onOrient);
                tiltOn = true; btnTilt.setAttribute('aria-pressed', 'true'); btnTilt.textContent = 'Inclinación activa';
            } catch (err) { btnTilt.textContent = 'Sin acceso al sensor'; }
        });
    }

    // tamaño y cámara
    function resize() {
        const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
        renderer.setSize(w, h, false); camera.aspect = w / h;
        const needW = 7.2, needH = 5.4;
        const vfov = camera.fov * Math.PI / 180;
        const distH = (needH / 2) / Math.tan(vfov / 2);
        const distW = (needW / 2) / (Math.tan(vfov / 2) * camera.aspect);
        const d = Math.max(distH, distW) * 1.05;
        camera.position.set(d * 0.5, 0.9, d * 0.866); camera.lookAt(camTarget); camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(stage); resize();

    // carga del modelo
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(root.getAttribute('data-model'), (g) => {
        g.scene.traverse(o => {
            if (!o.isMesh) return;
            const n = (o.name || '') + ' ' + (o.parent ? o.parent.name : '');
            if (/_izq/.test(n)) parts.izq.push(o);
            if (/_der/.test(n)) parts.der.push(o);
            if (o.material && o.material.name === 'Violeta') { o.material.envMapIntensity = 1.2; }
        });
        swing.add(g.scene);
        root.classList.add('eq3d-ready');
        if (poster) poster.hidden = true;
        start();
    }, undefined, () => { root.classList.add('eq3d-error'); say('No se pudo cargar el modelo.'); });

    // bucle
    let running = false, raf = 0, last = 0;
    function frame(ms) {
        const t = ms / 1000; let dt = Math.min(0.033, last ? t - last : 0.016); last = t;
        phi += (phiTarget - phi) * Math.min(1, dt * 4);
        if (!fallen) {
            if (!reduce) { nextGust -= dt; if (nextGust <= 0) { omega += (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.18); nextGust = 4 + Math.random() * 5; } }
            // integración en pasos pequeños
            const steps = 4, h = dt / steps, I = inertia();
            for (let i = 0; i < steps; i++) { const a = torque(theta) / I - DAMP * omega; omega += a * h; theta += omega * h; }
            if (Math.abs(theta) > 1.95) { fallen = true; fallT = 0; fallV = 0; }
        } else {
            fallT += dt; fallV += 9.8 * dt * 0.6; fallY -= fallV * dt; omega *= 0.99; theta += omega * dt;
            swing.position.y = fallY;
            if (fallT > 2.6) reset();
        }
        swing.rotation.z = theta;
        // la cuerda se hunde un poco con el balanceo
        const sag = Math.min(0.08, Math.abs(omega) * 0.04);
        if (!fallen) swing.position.y = -sag; rope.position.y = fallen ? 0 : -sag;
        // parallax suave de cámara
        renderer.render(scene, camera);
        describe();
        if (running) raf = requestAnimationFrame(frame);
    }
    function start() {
        if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    new IntersectionObserver(([e]) => { if (e.isIntersecting && root.classList.contains('eq3d-ready')) start(); else if (!e.isIntersecting) stop(); }, { rootMargin: '60px' }).observe(stage);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (root.classList.contains('eq3d-ready')) start(); });
}

function boot() {
    document.querySelectorAll('[data-equilibrio3d]').forEach((root) => {
        // carga diferida: solo cuando la pieza está cerca de la pantalla
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); init(root); } }, { rootMargin: '300px' });
        io.observe(root);
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
