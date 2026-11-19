/**
 * Personnage articulé, style « designer toy » : uniquement des blocs aux arêtes
 * arrondies (RoundedBoxGeometry), visage peint sur une texture Canvas.
 * Jambes, bras, buste et tête pivotent séparément → marche + salut « ojigi » (お辞儀).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterLook } from '../data/cityConfig';
import { blobShadowTexture, shade } from './textures';

/* ───────────────────────── caches (géométries / matériaux / visages) ───────────────────────── */

const geoCache = new Map<string, THREE.BufferGeometry>();
/** bloc arrondi (rayon 0.04–0.06 par défaut, borné par la plus petite dimension) */
function rbox(w: number, h: number, d: number, r = 0.05): THREE.BufferGeometry {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.002);
  const k = `${w},${h},${d},${rr}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.004, rr));
    geoCache.set(k, g);
  }
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.7): THREE.MeshStandardMaterial {
  const k = `${color}:${rough}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    matCache.set(k, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = false;
  return o;
}

type FaceKind = 'smile' | 'calm' | 'happy';

const faceCache = new Map<string, THREE.MeshStandardMaterial>();
/** visage minimaliste : yeux ovales + reflet, sourcils, joues roses, petite bouche */
function faceMaterial(kind: FaceKind, glasses: boolean, brow: string): THREE.MeshStandardMaterial {
  const k = `${kind}|${glasses}|${brow}`;
  let m = faceCache.get(k);
  if (m) return m;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x - w / 2, y - h / 2, w, h, r);
  };
  // joues
  g.fillStyle = 'rgba(255,120,120,0.42)';
  for (const x of [52, 204]) {
    g.beginPath();
    g.ellipse(x, 168, 26, 15, 0, 0, Math.PI * 2);
    g.fill();
  }
  // yeux
  for (const x of [84, 172]) {
    if (kind === 'happy') {
      g.strokeStyle = '#1d1d26';
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(x, 128, 17, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else {
      g.fillStyle = '#1d1d26';
      rr(x, 124, 26, kind === 'calm' ? 30 : 42, 13);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + 5, 112, 5.5, 0, Math.PI * 2);
      g.fill();
    }
    // sourcil
    g.fillStyle = brow;
    rr(x, 80, 38, 9, 4.5);
    g.fill();
  }
  // bouche
  g.strokeStyle = '#8c3a36';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  if (kind === 'calm') {
    g.moveTo(116, 192);
    g.lineTo(140, 192);
  } else {
    g.arc(128, 180, 16, Math.PI * 0.18, Math.PI * 0.82);
  }
  g.stroke();
  // lunettes : montures arrondies
  if (glasses) {
    g.strokeStyle = '#26262c';
    g.lineWidth = 8;
    for (const x of [84, 172]) {
      rr(x, 124, 70, 56, 18);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(119, 120);
    g.lineTo(137, 120);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  faceCache.set(k, m);
  return m;
}

const faceGeo = new THREE.PlaneGeometry(0.42, 0.42);

/** petit hachage stable pour varier les visages sans configuration */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ───────────────────────── personnage ───────────────────────── */

export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private shadow: THREE.Mesh;
  private phase = Math.random() * 10;
  private moveAmt = 0;
  private bowT = -1;
  private readonly bowDuration = 1.6;
  private idleT = Math.random() * 10;
  private targetYaw = 0;
  /** 0 = debout, 1 = assis (sur un banc : assise 0,55 au-dessus des pieds) */
  sit = 0;

  constructor(look: CharacterLook) {
    const s = look.scale ?? 1;
    this.root.scale.setScalar(s);
    this.root.add(this.body);

    // ombre de contact douce
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.8),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.95 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);

    const skin = mat(look.skin, 0.55);
    const hair = mat(look.hair, 0.8);
    const top = mat(look.top);
    const bottom = mat(look.bottom);
    const shoes = mat(look.shoes, 0.45);
    const sole = mat(shade(look.shoes, look.shoes.toLowerCase() === '#ffffff' ? -0.25 : 0.55), 0.6);

    // ── jambes (pivot à la hanche)
    const hipY = 0.82;
    for (const [leg, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      leg.position.set(0.12 * side, hipY, 0);
      leg.add(mesh(rbox(0.21, 0.66, 0.23, 0.05), bottom, 0, -0.36, 0));
      leg.add(mesh(rbox(0.25, 0.14, 0.35, 0.06), shoes, 0, -0.74, 0.05));
      leg.add(mesh(rbox(0.26, 0.045, 0.36, 0.02), sole, 0, -0.8, 0.05, false));
      this.body.add(leg);
    }
    // bassin
    this.body.add(mesh(rbox(0.48, 0.2, 0.3, 0.05), bottom, 0, hipY, 0));

    // ── haut du corps (pivot au bassin pour la courbette)
    this.upper.position.set(0, hipY + 0.04, 0);
    this.body.add(this.upper);
    this.upper.add(mesh(rbox(0.54, 0.64, 0.32, 0.06), top, 0, 0.32, 0));
    // col
    this.upper.add(mesh(rbox(0.3, 0.06, 0.26, 0.025), mat(shade(look.top, -0.12)), 0, 0.64, 0, false));

    if (look.apron) {
      // tablier (konbini / ramen) : bavette, bretelles, lien à la taille
      const ap = mat(look.apron, 0.85);
      this.upper.add(mesh(rbox(0.46, 0.74, 0.04, 0.02), ap, 0, 0.2, 0.172));
      this.upper.add(mesh(rbox(0.06, 0.24, 0.03, 0.012), ap, -0.16, 0.6, 0.165, false));
      this.upper.add(mesh(rbox(0.06, 0.24, 0.03, 0.012), ap, 0.16, 0.6, 0.165, false));
      this.upper.add(mesh(rbox(0.57, 0.06, 0.35, 0.025), mat(shade(look.apron, -0.18), 0.85), 0, 0.08, 0, false));
      this.upper.add(mesh(rbox(0.2, 0.12, 0.03, 0.012), mat(shade(look.apron, 0.15), 0.85), 0, 0.05, 0.195, false));
    }
    if (look.tie) {
      // cravate (banque, gare) : col blanc, nœud, pan à pointe
      const white = mat('#f6f6f6', 0.6);
      this.upper.add(mesh(rbox(0.22, 0.09, 0.03, 0.012), white, 0, 0.6, 0.162, false));
      const tie = mat(look.tie, 0.5);
      this.upper.add(mesh(rbox(0.09, 0.07, 0.04, 0.015), tie, 0, 0.55, 0.175, false));
      this.upper.add(mesh(rbox(0.085, 0.3, 0.025, 0.01), tie, 0, 0.37, 0.172, false));
      const tip = mesh(rbox(0.07, 0.07, 0.025, 0.01), tie, 0, 0.215, 0.172, false);
      tip.rotation.z = Math.PI / 4;
      this.upper.add(tip);
    }
    if (look.backpack) {
      // sac à dos du joueur : corps, rabat, poche, bretelles devant + sur les épaules
      const bp = mat(look.backpack, 0.75);
      const dark = mat(shade(look.backpack, -0.25), 0.8);
      this.upper.add(mesh(rbox(0.44, 0.52, 0.22, 0.06), bp, 0, 0.32, -0.27));
      this.upper.add(mesh(rbox(0.46, 0.14, 0.25, 0.05), dark, 0, 0.54, -0.28));
      this.upper.add(mesh(rbox(0.32, 0.18, 0.07, 0.03), dark, 0, 0.18, -0.4));
      for (const x of [-0.15, 0.15]) {
        this.upper.add(mesh(rbox(0.075, 0.5, 0.03, 0.012), dark, x, 0.36, 0.172, false));
        this.upper.add(mesh(rbox(0.075, 0.035, 0.42, 0.012), dark, x, 0.645, -0.03, false));
      }
    }

    // ── bras (pivot à l'épaule)
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(0.335 * side, 0.58, 0);
      arm.add(mesh(rbox(0.15, 0.34, 0.17, 0.05), top, 0, -0.13, 0));
      arm.add(mesh(rbox(0.13, 0.25, 0.14, 0.045), skin, 0, -0.4, 0));
      arm.add(mesh(rbox(0.14, 0.13, 0.14, 0.055), skin, 0, -0.57, 0.005));
      this.upper.add(arm);
    }
    if (look.briefcase) {
      // mallette du salaryman, tenue à la main droite
      const bc = mat(look.briefcase, 0.45);
      this.armR.add(mesh(rbox(0.04, 0.08, 0.16, 0.015), mat('#1a1a1a', 0.5), 0, -0.66, 0));
      this.armR.add(mesh(rbox(0.11, 0.3, 0.44, 0.04), bc, 0, -0.86, 0));
      this.armR.add(mesh(rbox(0.12, 0.03, 0.12, 0.01), mat('#c9a34a', 0.35), 0, -0.76, 0, false));
    }

    // ── tête (grosse tête de figurine)
    this.head.position.set(0, 0.68, 0);
    this.upper.add(this.head);
    this.head.add(mesh(rbox(0.17, 0.12, 0.17, 0.04), skin, 0, 0.04, 0));
    this.head.add(mesh(rbox(0.54, 0.5, 0.48, 0.06), skin, 0, 0.33, 0));
    // oreilles
    this.head.add(mesh(rbox(0.06, 0.12, 0.1, 0.025), skin, -0.28, 0.31, -0.01, false));
    this.head.add(mesh(rbox(0.06, 0.12, 0.1, 0.025), skin, 0.28, 0.31, -0.01, false));
    // visage peint
    const h = hash(`${look.hair}${look.top}${look.skin}`);
    const kinds: FaceKind[] = ['smile', 'calm', 'happy', 'smile'];
    const face = new THREE.Mesh(faceGeo, faceMaterial(kinds[h % kinds.length], !!look.glasses, shade(look.hair, 0.08)));
    face.position.set(0, 0.31, 0.2412);
    face.renderOrder = 2;
    this.head.add(face);

    // ── cheveux : blocs empilés + frange
    const covered = look.hat === 'cap' || look.hat === 'beret';
    if (!covered) this.head.add(mesh(rbox(0.58, 0.15, 0.52, 0.06), hair, 0, 0.6, -0.01));
    // arrière + côtés (communs)
    const backH = look.hairStyle === 'long' ? 0.62 : look.hairStyle === 'bob' ? 0.4 : 0.3;
    this.head.add(mesh(rbox(0.58, backH, 0.14, 0.05), hair, 0, 0.58 - backH / 2, -0.21));
    const sideH = look.hairStyle === 'long' || look.hairStyle === 'bob' ? 0.4 : 0.2;
    for (const x of [-0.285, 0.285]) this.head.add(mesh(rbox(0.07, sideH, 0.38, 0.03), hair, x, 0.58 - sideH / 2, -0.04));
    // frange : trois mèches décalées
    const fringe: [number, number, number][] =
      look.hairStyle === 'bob'
        ? [
            [-0.17, 0.5, 0.2],
            [0, 0.5, 0.2],
            [0.17, 0.5, 0.2],
          ]
        : [
            [-0.17, 0.52, 0.16],
            [0.01, 0.5, 0.2],
            [0.18, 0.53, 0.14],
          ];
    for (const [x, y, w] of fringe) this.head.add(mesh(rbox(w, 0.12, 0.1, 0.04), hair, x, y, 0.21, false));
    switch (look.hairStyle) {
      case 'bun':
        this.head.add(mesh(rbox(0.24, 0.2, 0.22, 0.06), hair, 0, 0.74, -0.12));
        break;
      case 'spiky':
        // mèches en blocs inclinés (pas de cônes)
        for (let i = 0; i < 5; i++) {
          const b = mesh(rbox(0.14, 0.18, 0.16, 0.04), hair, -0.2 + i * 0.1, 0.71, -0.04 - (i % 2) * 0.1);
          b.rotation.z = (i - 2) * -0.28;
          this.head.add(b);
        }
        break;
      case 'long':
        // queue de cheveux plate dans le dos
        this.head.add(mesh(rbox(0.4, 0.3, 0.1, 0.04), hair, 0, 0.02, -0.25));
        break;
    }

    // ── couvre-chefs
    const hatC = mat(look.hatColor ?? '#333333', 0.6);
    switch (look.hat) {
      case 'cap': {
        // casquette d'agent : calotte, bandeau, visière, insigne doré
        this.head.add(mesh(rbox(0.6, 0.18, 0.54, 0.06), hatC, 0, 0.64, -0.01));
        this.head.add(mesh(rbox(0.61, 0.06, 0.55, 0.025), mat(shade(look.hatColor ?? '#333333', -0.3), 0.5), 0, 0.57, -0.01, false));
        this.head.add(mesh(rbox(0.46, 0.04, 0.2, 0.018), mat(shade(look.hatColor ?? '#333333', -0.35), 0.4), 0, 0.55, 0.3));
        this.head.add(mesh(rbox(0.09, 0.08, 0.03, 0.012), mat('#e6c25a', 0.3), 0, 0.65, 0.265, false));
        break;
      }
      case 'band':
        this.head.add(mesh(rbox(0.6, 0.08, 0.54, 0.035), hatC, 0, 0.53, -0.01));
        this.head.add(mesh(rbox(0.12, 0.1, 0.06, 0.02), hatC, 0.2, 0.55, 0.26, false));
        break;
      case 'beret': {
        const b = mesh(rbox(0.62, 0.12, 0.58, 0.06), hatC, 0, 0.66, -0.02);
        b.rotation.z = 0.12;
        this.head.add(b);
        break;
      }
    }
  }

  setYaw(yaw: number, instant = false) {
    this.targetYaw = yaw;
    if (instant) this.root.rotation.y = yaw;
  }

  faceTowards(x: number, z: number, instant = false) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.setYaw(Math.atan2(dx, dz), instant);
  }

  /** Lance une courbette (ojigi) */
  bow() {
    this.bowT = 0;
  }

  get isBowing() {
    return this.bowT >= 0;
  }

  /** move01 = vitesse normalisée (0 = immobile, 1 = marche, >1 = course) */
  update(dt: number, move01: number) {
    // rotation douce
    let d = this.targetYaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 12);

    this.moveAmt += (move01 - this.moveAmt) * Math.min(1, dt * 10);
    const m = this.moveAmt;
    this.phase += dt * (7 + m * 3.5) * (m > 0.02 ? 1 : 0);
    this.idleT += dt;
    const swing = Math.sin(this.phase) * 0.65 * Math.min(1, m);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.85;
    this.armR.rotation.x = swing * 0.85;
    this.armL.rotation.z = -0.06;
    this.armR.rotation.z = 0.06;
    const bob = Math.abs(Math.sin(this.phase)) * 0.06 * Math.min(1, m);
    this.body.position.y = bob + Math.sin(this.idleT * 2) * 0.008 * (1 - Math.min(1, m));
    // assis : bassin posé sur l'assise, jambes vers l'avant (pieds qui pendent), mains sur les cuisses
    const st = this.sit;
    if (st > 0) {
      const k = st * st * (3 - 2 * st);
      this.body.position.y += (0.55 / this.root.scale.y - 0.72) * k;
      this.legL.rotation.x = this.legL.rotation.x * (1 - k) - 1.32 * k;
      this.legR.rotation.x = this.legR.rotation.x * (1 - k) - 1.32 * k;
      this.legL.rotation.z = -0.06 * k;
      this.legR.rotation.z = 0.06 * k;
      this.armL.rotation.x = this.armL.rotation.x * (1 - k) - 0.62 * k;
      this.armR.rotation.x = this.armR.rotation.x * (1 - k) - 0.62 * k;
    } else {
      this.legL.rotation.z = 0;
      this.legR.rotation.z = 0;
    }
    // l'ombre se resserre quand le corps « décolle »
    this.shadow.scale.setScalar(1 - bob * 2.2);

    // courbette : descente → pause → remontée
    let bow = 0;
    if (this.bowT >= 0) {
      this.bowT += dt;
      const t = this.bowT / this.bowDuration;
      if (t >= 1) this.bowT = -1;
      else if (t < 0.3) bow = ease(t / 0.3);
      else if (t < 0.6) bow = 1;
      else bow = 1 - ease((t - 0.6) / 0.4);
    }
    this.upper.rotation.x = bow * 0.6 + m * 0.06;
    this.head.rotation.x = bow * 0.15;
    if (bow > 0) {
      // bras le long du corps / mains jointes
      this.armL.rotation.x = -bow * 0.25;
      this.armR.rotation.x = -bow * 0.25;
      this.armL.rotation.z = bow * 0.25;
      this.armR.rotation.z = -bow * 0.25;
    }
  }
}

function ease(t: number) {
  return t * t * (3 - 2 * t);
}
