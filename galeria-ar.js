/* Galería viva · realidad aumentada con reconocimiento de imagen (MindAR), sin apps. */
import * as THREE from 'three';

const OBRAS = [
    { id: 'handfull', titulo: 'HANDFULL', aspect: 928 / 768 },
    { id: 'mouthfull', titulo: 'MOUTHFULL', aspect: 928 / 768 },
    { id: 'bocallena', titulo: 'Bocallena Corazón Colorido', aspect: 1024 / 768 }
];
const V = '16';

let busy = false;
async function abrir() {
    if (busy) return; busy = true;
    const ov = document.createElement('div');
    ov.className = 'ar-overlay';
    ov.innerHTML = '<div class="ar-stage"></div>' +
        '<div class="ar-top"><span class="ar-title" aria-live="polite">Apunta a una obra</span><button type="button" class="ar-close" aria-label="Cerrar la cámara">Cerrar</button></div>' +
        '<p class="ar-help">HANDFULL · MOUTHFULL · Bocallena<br>Usa la pintura real o su imagen en otra pantalla.</p>' +
        '<p class="ar-status">Cargando la cámara…</p>';
    document.body.appendChild(ov); document.body.classList.add('sense-lock');
    const stage = ov.querySelector('.ar-stage'), title = ov.querySelector('.ar-title'), status = ov.querySelector('.ar-status');
    let mind = null, videos = [];
    const cerrar = async () => {
        try { mind && mind.renderer.setAnimationLoop(null); mind && await mind.stop(); } catch (e) {}
        videos.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
        ov.remove(); document.body.classList.remove('sense-lock'); busy = false;
    };
    ov.querySelector('.ar-close').addEventListener('click', cerrar);
    try {
        const { MindARThree } = await import('/vendor/mindar/mindar-image-three.prod.js');
        mind = new MindARThree({ container: stage, imageTargetSrc: '/media/galeria/targets.mind?v=' + V, uiScanning: 'no', uiLoading: 'no', uiError: 'no', filterMinCF: 0.0001, filterBeta: 0.001 });
        const { renderer, scene, camera } = mind;
        OBRAS.forEach((o, i) => {
            const v = document.createElement('video');
            v.src = '/media/galeria/' + o.id + '.mp4?v=' + V; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto';
            videos.push(v);
            const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace;
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, o.aspect), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 }));
            const anchor = mind.addAnchor(i); anchor.group.add(plane);
            anchor.onTargetFound = () => { v.play().catch(() => {}); plane.userData.on = true; title.textContent = o.titulo; ov.classList.add('found'); };
            anchor.onTargetLost = () => { v.pause(); plane.userData.on = false; title.textContent = 'Apunta a una obra'; ov.classList.remove('found'); };
            plane.userData.mat = plane.material;
            scene.add(anchor.group);
            videos[i]._plane = plane;
        });
        await mind.start();
        status.textContent = '';
        renderer.setAnimationLoop(() => {
            videos.forEach(v => { const p = v._plane; const m = p.userData.mat; m.opacity += ((p.userData.on ? 1 : 0) - m.opacity) * 0.15; });
            renderer.render(scene, camera);
        });
    } catch (err) {
        console.warn(err);
        status.textContent = 'No pudimos abrir la cámara. Revisa el permiso del navegador e inténtalo de nuevo.';
    }
}
document.querySelectorAll('[data-ar-open]').forEach(b => b.addEventListener('click', abrir));
