/**
 * Train à grande vitesse « maison » (design original) : caisse blanche à section
 * elliptique, long nez profilé, bandeau bleu. Utilisé sur le viaduc de la place
 * à la fontaine et dans la cinématique du trajet.
 *
 * Le train est orienté le long de +x (nez de tête côté +x), roues à y = 0.
 */
import * as THREE from 'three';

const BLUE = '#1f5fbf';
const NAVY = '#16264a';

let bodyTex: THREE.CanvasTexture | null = null;
let noseTex: THREE.CanvasTexture | null = null;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Caisse (cylindre couché) : u = tour de la section (0 = flanc +z, 0.25 = dessous,
 * 0.5 = flanc -z, 0.75 = toit), v = longueur de la voiture.
 */
function bodyTexture() {
  if (bodyTex) return bodyTex;
  const W = 1024;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, W, H);
  // dessous gris clair
  ctx.fillStyle = '#c9ced6';
  ctx.fillRect(0.12 * W, 0, 0.26 * W, H);
  // bandes : [u0, u1] pour chaque flanc (le flanc +z chevauche la couture u = 0/1)
  const band = (u0: number, u1: number, color: string) => {
    ctx.fillStyle = color;
    for (const off of [0, 1, -1]) ctx.fillRect((u0 + off) * W, 0, (u1 - u0) * W, H);
  };
  band(0.022, 0.07, BLUE); // flanc +z, sous les fenêtres
  band(0.43, 0.478, BLUE); // flanc -z
  band(0.078, 0.088, NAVY);
  band(0.412, 0.422, NAVY);
  // fenêtres (au-dessus du bandeau), coins arrondis, reflet du ciel
  const win = (u0: number, u1: number, lowFirst: boolean) => {
    const w = (u1 - u0) * W;
    const h = 0.056 * H;
    for (let v = 0.045; v < 0.94; v += 0.075) {
      const x = u0 * W;
      const y = v * H;
      ctx.fillStyle = '#16243a';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.28);
      ctx.fill();
      // reflet : bande claire côté haut de la vitre
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      const a = 'rgba(175,215,255,0.38)';
      const z = 'rgba(175,215,255,0)';
      g.addColorStop(0, lowFirst ? z : a);
      g.addColorStop(0.55, z);
      g.addColorStop(1, lowFirst ? a : z);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.28);
      ctx.fill();
    }
  };
  win(0.925, 0.985, false);
  win(0.515, 0.575, true);
  bodyTex = finish(c);
  return bodyTex;
}

/**
 * Nez (demi-ellipsoïde) : u = tour (0 = toit, 0.25 = flanc +z, 0.5 = dessous,
 * 0.75 = flanc -z), v = 0.5 à la base → 1 à la pointe.
 */
function noseTexture() {
  if (noseTex) return noseTex;
  const W = 1024;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c9ced6';
  ctx.fillRect(0.4 * W, 0, 0.2 * W, H);
  // y canvas : v = 1 en haut (y = 0) ; la base du nez (v = 0.5) est au milieu
  const y = (v: number) => (1 - v) * H;
  // bandeau bleu qui file vers la pointe en s'affinant (vague)
  const swoosh = (side: 1 | -1) => {
    const base = side > 0 ? 0.25 : 0.75;
    const dir = side; // vers le dessous
    ctx.fillStyle = BLUE;
    ctx.beginPath();
    ctx.moveTo((base + dir * 0.035) * W, y(0.5));
    ctx.lineTo((base + dir * 0.07) * W, y(0.5));
    ctx.quadraticCurveTo((base + dir * 0.09) * W, y(0.75), (base + dir * 0.2) * W, y(0.97));
    ctx.quadraticCurveTo((base + dir * 0.1) * W, y(0.72), (base + dir * 0.035) * W, y(0.5));
    ctx.fill();
    // phare
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.ellipse((base + dir * 0.06) * W, y(0.86), 0.012 * W, 0.03 * H, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  swoosh(1);
  swoosh(-1);
  // pare-brise de cabine enveloppant (sur le toit, u ≈ 0 / 1), plus étroit vers la pointe
  const shield = (cx: number) => {
    ctx.beginPath();
    ctx.moveTo((cx - 0.17) * W, y(0.6));
    ctx.quadraticCurveTo(cx * W, y(0.57), (cx + 0.17) * W, y(0.6));
    ctx.quadraticCurveTo((cx + 0.15) * W, y(0.7), (cx + 0.1) * W, y(0.765));
    ctx.quadraticCurveTo(cx * W, y(0.79), (cx - 0.1) * W, y(0.765));
    ctx.quadraticCurveTo((cx - 0.15) * W, y(0.7), (cx - 0.17) * W, y(0.6));
    ctx.closePath();
  };
  for (const off of [0, 1]) {
    // liseré bleu marine autour de la vitre
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 0.012 * W;
    shield(off);
    ctx.stroke();
    const g = ctx.createLinearGradient(0, y(0.6), 0, y(0.78));
    g.addColorStop(0, '#22385a');
    g.addColorStop(1, '#101a2c');
    ctx.fillStyle = g;
    shield(off);
    ctx.fill();
  }
  // reflet
  ctx.fillStyle = 'rgba(185,220,255,0.32)';
  for (const off of [0, 1]) {
    ctx.beginPath();
    ctx.ellipse(off * W + 0.05 * W, y(0.71), 0.05 * W, 0.018 * H, -0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  noseTex = finish(c);
  return noseTex;
}

export interface TrainOptions {
  /** nombre de voitures (≥ 2 : les deux extrêmes ont un nez) */
  cars?: number;
  carLength?: number;
  /** demi-hauteur et demi-largeur de la section */
  ry?: number;
  rz?: number;
  noseLength?: number;
  /** ombres portées */
  shadows?: boolean;
}

/** fabrique un train complet ; retourne le groupe et sa longueur totale */
export function makeShinkansen(opts: TrainOptions = {}) {
  const cars = Math.max(2, opts.cars ?? 3);
  const L = opts.carLength ?? 6.4;
  const ry = opts.ry ?? 0.85;
  const rz = opts.rz ?? 0.78;
  const NL = opts.noseLength ?? 4.0;
  const shadows = opts.shadows ?? true;
  const clearance = 0.42;
  const cy = clearance + ry;

  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ map: bodyTexture(), roughness: 0.32, metalness: 0.05 });
  const noseMat = new THREE.MeshStandardMaterial({ map: noseTexture(), roughness: 0.3, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: '#8d96a3', roughness: 0.5 });

  // caisse : cylindre couché le long de x, section elliptique
  const bodyGeo = new THREE.CylinderGeometry(1, 1, L, 40, 1, true);
  bodyGeo.rotateZ(-Math.PI / 2);
  bodyGeo.scale(1, ry, rz);
  // nez : demi-sphère étirée, pointe un peu abaissée (bec de canard)
  const noseGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  noseGeo.rotateZ(-Math.PI / 2);
  noseGeo.scale(NL, ry, rz);
  const p = noseGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i) / NL; // 0 base → 1 pointe
    const y = p.getY(i);
    // le toit descend en pente douce, le dessous reste à plat
    p.setY(i, y > 0 ? y * (1 - 0.35 * k * k) - 0.32 * ry * k * k : y * (1 - 0.15 * k) - 0.05 * ry * k * k);
  }
  noseGeo.computeVertexNormals();

  const total = cars * L + 2 * NL;
  const x0 = -total / 2 + NL;
  for (let i = 0; i < cars; i++) {
    const cx = x0 + L * i + L / 2;
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(cx, cy, 0);
    body.castShadow = shadows;
    body.receiveShadow = shadows;
    g.add(body);
    // jupe et bogies
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.26, rz * 1.6), dark);
    skirt.position.set(cx, clearance + 0.05, 0);
    g.add(skirt);
    for (const s of [-1, 1]) {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, rz * 1.4), dark);
      bogie.position.set(cx + s * (L / 2 - 1.2), 0.2, 0);
      g.add(bogie);
      for (const w of [-0.45, 0.45]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, rz * 1.5, 14), grey);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(cx + s * (L / 2 - 1.2) + w, 0.2, 0);
        g.add(wheel);
      }
    }
    // soufflet entre deux voitures
    if (i < cars - 1) {
      const gw = new THREE.Mesh(new THREE.BoxGeometry(0.34, ry * 1.5, rz * 1.4), dark);
      gw.position.set(cx + L / 2, cy, 0);
      g.add(gw);
    }
    // pantographe sur la voiture du milieu
    if (i === Math.floor(cars / 2)) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.6), grey);
      base.position.set(cx, cy + ry - 0.02, 0);
      g.add(base);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), grey);
      arm.position.set(cx + 0.2, cy + ry + 0.32, 0);
      arm.rotation.z = 0.5;
      g.add(arm);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.9), grey);
      bar.position.set(cx + 0.65, cy + ry + 0.58, 0);
      g.add(bar);
    }
  }
  // deux nez (tête vers +x, queue vers -x)
  for (const s of [1, -1]) {
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(s > 0 ? x0 + cars * L : x0, cy, 0);
    if (s < 0) nose.rotation.y = Math.PI;
    nose.castShadow = shadows;
    nose.receiveShadow = shadows;
    g.add(nose);
  }
  return { group: g, length: total, height: cy + ry };
}
