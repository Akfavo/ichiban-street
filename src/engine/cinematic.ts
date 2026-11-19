/**
 * Cinématique du trajet en shinkansen : en plein jour, le train file sur un
 * viaduc à travers la campagne japonaise (rizières, villages aux toits de tuiles,
 * cerisiers en fleurs, torii), le mont Fuji enneigé au loin.
 *
 * Le train reste immobile, c'est le décor qui défile (pas de grandes coordonnées
 * → pas de tremblement de flottants). Le décor proche vit dans trois « tuiles »
 * identiques fusionnées (un seul appel de dessin chacune) qui se recyclent hors
 * champ, cachées par la brume.
 *
 * Anti-scintillement : rien de coplanaire visible (rivière surélevée +
 * polygonOffset), textures mipmappées et anisotropes, brume sur les lointains,
 * seuls les nuages sont transparents.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeShinkansen } from './shinkansen';
import { mulberry } from './textures';

const SPEED = 46; // unités / s
const DECK_Y = 6; // dessus du tablier
const PILLAR_GAP = 14;
const POLE_GAP = 28;
const TILE = 616; // longueur d'une tuile de décor (multiple de 14 et 28)
const BRIDGE_SPAN = 34;
const GROUND_TILE = 96; // une répétition de la texture des rizières

const HAZE = '#d6e8f2'; // brume = couleur d'horizon du ciel
const C = {
  skyTop: new THREE.Color('#3f86d0'),
  skyMid: new THREE.Color('#8fc2ea'),
  horizon: new THREE.Color(HAZE),
};

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** accumule des formes colorées puis les fusionne en un seul maillage */
class Batch {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  add(src: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    this.e.set(0, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    g.applyMatrix4(this.m);
    this.c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([this.c.r, this.c.g, this.c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
  }

  build(mat: THREE.Material) {
    const geo = mergeGeometries(this.parts)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return new THREE.Mesh(geo, mat);
  }
}

// formes de base (base à y = 0)
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const ROOF = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const BLOB = new THREE.IcosahedronGeometry(1, 0);
const CONE = new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0);
const POST = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).translate(0, 0.5, 0);

export interface Cinematic {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  dispose(): void;
}

export function createShinkansenCinematic(canvas: HTMLCanvasElement, maxAniso: number): Cinematic {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE, 90, 520);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 2600);
  const textures: THREE.Texture[] = [];
  const own = <T extends THREE.Texture>(t: T) => (textures.push(t), t);
  const rnd = mulberry(2024);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  /* ── ciel : dôme en dégradé bleu, brume claire à l'horizon ── */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: C.skyTop },
      mid: { value: C.skyMid },
      horizon: { value: C.horizon },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.14, h));
        c = mix(c, top, smoothstep(0.14, 0.55, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  /* ── mont Fuji : cône concave, neige en dents de scie, ombrage « peint » ── */
  {
    const H = 300;
    const R = 470;
    const prof: THREE.Vector2[] = [];
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const k = i / N; // 0 base → 1 sommet
      const r = R * (0.075 + 0.925 * Math.pow(1 - k, 1.55));
      prof.push(new THREE.Vector2(r, -40 + (H + 40) * k));
    }
    prof.push(new THREE.Vector2(R * 0.045, H - 6)); // cratère
    const geo = new THREE.LatheGeometry(prof, 160);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const snowLit = new THREE.Color('#ffffff');
    const snowShade = new THREE.Color('#c6d6ea');
    const rockTop = new THREE.Color('#58789f');
    const rockLow = new THREE.Color('#9ab7cf');
    const haze = new THREE.Color(HAZE);
    const tmp = new THREE.Color();
    // la face éclairée regarde la caméra (le soleil est derrière elle)
    const centre = new THREE.Vector3(-0.55, 0, -0.835).normalize().multiplyScalar(1600);
    const sunXZ = new THREE.Vector2(0.55, 0.835).normalize().rotateAround(new THREE.Vector2(), 0.5);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const yn = Math.max(0, y) / H;
      const phi = Math.atan2(z, x);
      const rx = Math.cos(phi);
      const rz = Math.sin(phi);
      const lit = 0.5 + 0.5 * (rx * sunXZ.x + rz * sunXZ.y); // 0 ombre → 1 soleil
      const snowLine = 0.6 + 0.07 * Math.sin(phi * 5) + 0.05 * Math.sin(phi * 13 + 1) + 0.035 * Math.sin(phi * 31 + 2);
      if (yn > snowLine) tmp.copy(snowShade).lerp(snowLit, Math.min(1, lit * 1.25));
      else {
        tmp.copy(rockLow).lerp(rockTop, Math.pow(yn / snowLine, 0.8));
        tmp.multiplyScalar(0.82 + 0.26 * lit);
      }
      // brume au pied de la montagne
      tmp.lerp(haze, Math.pow(1 - Math.min(1, yn * 1.6), 2) * 0.85);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const fuji = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    fuji.position.copy(centre).setY(0);
    fuji.renderOrder = -8;
    scene.add(fuji);
  }

  /* ── collines : deux anneaux continus (aucun bord visible), qui glissent lentement ── */
  const ring = (radius: number, base: number, amp: number, top: string, seed: number) => {
    const seg = 240;
    const pos: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const cTop = new THREE.Color(top);
    const cBot = new THREE.Color(HAZE);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // sinus à fréquences entières : la crête se referme sans couture
      const h = base + amp * (0.5 + 0.3 * Math.sin(a * 5 + seed) + 0.2 * Math.sin(a * 13 + seed * 2) + 0.12 * Math.sin(a * 29 + seed * 3));
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      pos.push(x, -10, z, x, Math.max(6, h), z);
      cols.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    scene.add(m);
    return m;
  };
  const hillsFar = ring(1050, 30, 55, '#93b2cb', 1.7);
  hillsFar.renderOrder = -7;
  const hillsNear = ring(640, 12, 34, '#86ad8c', 0.4);
  hillsNear.renderOrder = -6;

  /* ── nuages (seuls éléments transparents, immobiles) ── */
  {
    const cloudTex = own(
      canvasTex(512, 256, (ctx) => {
        const r = mulberry(7);
        for (let i = 0; i < 16; i++) {
          const x = 90 + r() * 330;
          const y = 150 - Math.sin(((x - 90) / 330) * Math.PI) * 60 + r() * 30;
          const rad = 40 + r() * 50;
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }),
    );
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
    // angle (autour de l'axe vertical, 0 = -z), distance, hauteur, largeur
    const clouds: [number, number, number, number][] = [
      [0.05, 1300, 260, 330],
      [0.32, 1150, 210, 260],
      [0.78, 1250, 330, 300],
      [0.95, 1100, 190, 240],
      [1.2, 1200, 240, 320],
      [-0.25, 1250, 220, 280],
      [1.45, 1300, 280, 260],
      [0.6, 1400, 175, 220],
    ];
    for (const [ang, dist, y, w] of clouds) {
      const s = new THREE.Sprite(mat);
      s.position.set(-Math.sin(ang) * dist, y, -Math.cos(ang) * dist);
      s.scale.set(w, w * 0.4, 1);
      s.renderOrder = -5;
      scene.add(s);
    }
  }

  /* ── sol : rizières qui défilent ── */
  const fieldTex = own(
    canvasTex(512, 512, (ctx) => {
      const r = mulberry(31);
      ctx.fillStyle = '#b8a678';
      ctx.fillRect(0, 0, 512, 512);
      const greens = ['#86b956', '#7aaf4c', '#93c162', '#6fa448', '#a5c96f', '#8fbf9a'];
      // bandes de parcelles de largeur variable, découpées en rectangles
      let y = 0;
      while (y < 512) {
        const bh = Math.min(512 - y, 48 + Math.floor(r() * 64));
        let x = 0;
        while (x < 512) {
          const bw = Math.min(512 - x, 60 + Math.floor(r() * 110));
          ctx.fillStyle = greens[Math.floor(r() * greens.length)];
          ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
          x += bw;
        }
        y += bh;
      }
      // rangs de riz, très doux (pas de lignes fines contrastées → pas de moiré)
      ctx.fillStyle = 'rgba(40,80,20,0.07)';
      for (let i = 0; i < 512; i += 8) ctx.fillRect(i, 0, 3, 512);
    }),
  );
  fieldTex.wrapS = fieldTex.wrapT = THREE.RepeatWrapping;
  fieldTex.anisotropy = maxAniso;
  const GROUND = 2400;
  fieldTex.repeat.set(GROUND / GROUND_TILE, GROUND / GROUND_TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshLambertMaterial({ map: fieldTex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  /* ── lumières de jour ── */
  scene.add(new THREE.HemisphereLight('#e4f3ff', '#7d9a5c', 1.5));
  const sun = new THREE.DirectionalLight('#fff0d8', 2.1);
  sun.position.set(60, 90, 80);
  scene.add(sun);

  /* ── viaduc continu (immobile : il est uniforme) ── */
  const concrete = new THREE.MeshStandardMaterial({ color: '#e3e1dc', roughness: 0.85 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: '#7d8494', roughness: 0.5, metalness: 0.3 });
  const deckLen = 2400;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.9, 5.2), concrete);
  deck.position.set(0, DECK_Y - 0.45, 0);
  scene.add(deck);
  for (const z of [-2.5, 2.5]) {
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.7, 0.22), concreteDark);
    parapet.position.set(0, DECK_Y + 0.35, z);
    scene.add(parapet);
  }
  for (const z of [-0.72, 0.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.08, 0.1), steel);
    rail.position.set(0, DECK_Y + 0.04, z);
    scene.add(rail);
  }
  const wire = new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.04, 0.04), steel);
  wire.position.set(0, DECK_Y + 2.95, 0);
  scene.add(wire);

  /* ── tuiles de décor : piles, pont, rivière, villages, arbres ── */
  const sceneryMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const waterTex = own(
    canvasTex(64, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, '#3f86b8');
      g.addColorStop(0.5, '#6db3dc');
      g.addColorStop(1, '#3f86b8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 256);
      ctx.fillStyle = 'rgba(225,245,255,0.5)';
      const r = mulberry(5);
      for (let i = 0; i < 18; i++) ctx.fillRect(8 + r() * 40, r() * 256, 10 + r() * 10, 2);
    }),
  );
  waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(1, 24);
  waterTex.anisotropy = maxAniso;
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const tileBatch = new Batch();
  {
    const b = tileBatch;
    const half = TILE / 2;
    const riverHalf = BRIDGE_SPAN / 2 + 4;
    const inRiver = (x: number, pad = 0) => Math.abs(x) < riverHalf + pad;

    // piles du viaduc et poteaux caténaires
    for (let x = -half; x < half; x += PILLAR_GAP) {
      if (Math.abs(x) < BRIDGE_SPAN / 2 + 3.5) continue;
      b.add(BOX, '#bdb9b0', x, 0, 0, 1.4, DECK_Y - 0.9, 2.6);
      b.add(BOX, '#d8d5ce', x, DECK_Y - 1.4, 0, 2.0, 0.5, 5.4);
    }
    for (let x = -half + 7; x < half; x += POLE_GAP) {
      if (Math.abs(x) < BRIDGE_SPAN / 2) continue;
      b.add(BOX, '#7d8494', x, DECK_Y, -2.35, 0.22, 3.6, 0.22);
      b.add(BOX, '#7d8494', x, DECK_Y + 3.14, -1.2, 0.12, 0.12, 2.4);
    }

    // pont en treillis vert
    {
      const green = '#3a9a52';
      const Hb = 4.4;
      const h2 = BRIDGE_SPAN / 2;
      const bar = (x0: number, y0: number, x1: number, y1: number, z: number) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const g = new THREE.BoxGeometry(len, 0.32, 0.32);
        b.add(g, green, (x0 + x1) / 2, (y0 + y1) / 2, z, 1, 1, 1, 0, Math.atan2(y1 - y0, x1 - x0));
        g.dispose();
      };
      const panels = 8;
      const step = BRIDGE_SPAN / panels;
      for (const z of [-2.35, 2.35]) {
        bar(-h2, DECK_Y + 0.1, h2, DECK_Y + 0.1, z);
        bar(-h2 + step, DECK_Y + Hb, h2 - step, DECK_Y + Hb, z);
        bar(-h2, DECK_Y + 0.1, -h2 + step, DECK_Y + Hb, z);
        bar(h2, DECK_Y + 0.1, h2 - step, DECK_Y + Hb, z);
        for (let i = 1; i < panels; i++) {
          const x = -h2 + i * step;
          bar(x, DECK_Y + 0.1, x, DECK_Y + Hb, z);
          if (i < panels - 1) {
            const up = i < panels / 2;
            bar(x, up ? DECK_Y + Hb : DECK_Y + 0.1, x + step, up ? DECK_Y + 0.1 : DECK_Y + Hb, z);
          }
        }
      }
      for (let i = 1; i < panels; i++) b.add(BOX, green, -h2 + i * step, DECK_Y + Hb - 0.11, 0, 0.22, 0.22, 4.7);
      for (const s of [-1, 1]) b.add(BOX, '#bdb9b0', s * (h2 + 1.5), 0, 0, 3, DECK_Y - 0.9, 6);
      // berges
      for (const s of [-1, 1]) b.add(BOX, '#9c8a62', s * (BRIDGE_SPAN / 2 - 1.4), 0, 0, 1.2, 0.5, 1200);
    }

    // maison japonaise : murs clairs, toit de tuiles en croupe
    const walls = ['#efe7d8', '#e7dcc8', '#f3eee4', '#d9c8a9', '#cdb48e'];
    const roofs = ['#3f4a5a', '#4b5566', '#56504a', '#3a4150', '#7a3b2e', '#5c6b7a'];
    const house = (x: number, z: number, ry: number) => {
      const w = 3.6 + rnd() * 2.6;
      const d = 3.2 + rnd() * 1.8;
      const two = rnd() < 0.45;
      const h = two ? 3.3 : 1.9;
      b.add(BOX, pick(walls), x, 0, z, w, h, d, ry);
      b.add(ROOF, pick(roofs), x, h, z, (w + 0.7) * Math.SQRT2 * 0.72, 1.1 + rnd() * 0.5, (d + 0.7) * Math.SQRT2 * 0.72, ry);
      // soubassement de bois sombre
      b.add(BOX, '#6d5440', x, 0, z, w + 0.05, 0.35, d + 0.05, ry);
    };
    const cherry = (x: number, z: number, s = 1) => {
      b.add(BOX, '#5d4636', x, 0, z, 0.32 * s, 1.6 * s, 0.32 * s);
      const pinks = ['#f7b7cd', '#f4a4c0', '#fbcfdf', '#f09ab9'];
      b.add(BLOB, pick(pinks), x, 2.4 * s, z, 1.7 * s, 1.25 * s, 1.7 * s, rnd() * 3);
      b.add(BLOB, pick(pinks), x + 0.9 * s, 2.0 * s, z + 0.4 * s, 1.1 * s, 0.9 * s, 1.1 * s, rnd() * 3);
      b.add(BLOB, pick(pinks), x - 0.8 * s, 2.1 * s, z - 0.5 * s, 1.15 * s, 0.9 * s, 1.15 * s, rnd() * 3);
    };
    const greens = ['#4d8a48', '#5e9c50', '#3f7a45', '#6aa354'];
    const tree = (x: number, z: number, s = 1) => {
      if (rnd() < 0.45) {
        b.add(BOX, '#5d4636', x, 0, z, 0.3 * s, 1 * s, 0.3 * s);
        b.add(CONE, pick(['#3f7a45', '#356b3e', '#4a8450']), x, 0.8 * s, z, 1.3 * s, 4.2 * s, 1.3 * s, rnd() * 3);
      } else {
        b.add(BOX, '#5d4636', x, 0, z, 0.3 * s, 1.4 * s, 0.3 * s);
        b.add(BLOB, pick(greens), x, 2.3 * s, z, 1.6 * s, 1.4 * s, 1.6 * s, rnd() * 3);
      }
    };
    const torii = (x: number, z: number, ry: number) => {
      const red = '#d8432c';
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      for (const k of [-1, 1]) b.add(POST, red, x + k * 1.5 * c, 0, z - k * 1.5 * s, 0.34, 3.6, 0.34);
      b.add(BOX, red, x, 2.8, z, 3.8, 0.28, 0.3, ry);
      b.add(BOX, '#2b2622', x, 3.55, z, 4.6, 0.32, 0.42, ry);
      b.add(BOX, red, x, 3.3, z, 4.2, 0.26, 0.36, ry);
    };

    // villages derrière le train (côté -z, celui que voit la caméra)
    const villages = 6;
    for (let v = 0; v < villages; v++) {
      let cx = -half + ((v + 0.15 + rnd() * 0.7) / villages) * TILE;
      if (inRiver(cx, 30)) cx += cx < 0 ? -40 : 40;
      const cz = -26 - rnd() * (v % 2 ? 140 : 60);
      const ry = (rnd() - 0.5) * 0.5;
      const n = 6 + Math.floor(rnd() * 9);
      for (let i = 0; i < n; i++) {
        const gx = (i % 4) - 1.5;
        const gz = Math.floor(i / 4) - 1;
        const x = cx + gx * 8.5 + (rnd() - 0.5) * 2.5;
        const z = cz + gz * 9 + (rnd() - 0.5) * 2.5;
        if (inRiver(x, 3) || z > -14) continue;
        house(x, z, ry + (rnd() < 0.25 ? Math.PI / 2 : 0));
      }
      // cerisiers autour du village
      for (let i = 0; i < 7; i++) {
        const x = cx + (rnd() - 0.5) * 50;
        const z = cz + (rnd() - 0.5) * 34;
        if (!inRiver(x, 2) && z < -12) cherry(x, z, 0.9 + rnd() * 0.5);
      }
      if (v === 2) torii(cx + 26, cz + 2, 0.2);
    }
    // cerisiers le long de la rivière
    for (let z = -16; z > -300; z -= 9 + rnd() * 8) for (const s of [-1, 1]) cherry(s * (riverHalf + 2.5 + rnd() * 3), z, 1 + rnd() * 0.4);
    // arbres épars près du viaduc et bosquets plus loin
    for (let i = 0; i < 70; i++) {
      const x = -half + rnd() * TILE;
      const z = -13 - rnd() * 60;
      if (!inRiver(x, 2)) (rnd() < 0.3 ? cherry : tree)(x, z, 0.8 + rnd() * 0.5);
    }
    for (let i = 0; i < 26; i++) {
      const gx = -half + rnd() * TILE;
      const gz = -120 - rnd() * 300;
      if (inRiver(gx, 10)) continue;
      const k = 6 + Math.floor(rnd() * 10);
      for (let j = 0; j < k; j++) tree(gx + (rnd() - 0.5) * 30, gz + (rnd() - 0.5) * 22, 1.4 + rnd() * 0.9);
    }
    // côté caméra (+z) : quelques fermes et arbres, loin et bas (ne masquent jamais le train)
    for (let i = 0; i < 10; i++) {
      const x = -half + rnd() * TILE;
      const z = 60 + rnd() * 200;
      if (inRiver(x, 4)) continue;
      if (rnd() < 0.5) house(x, z, rnd() * 0.4);
      else tree(x, z, 1 + rnd() * 0.6);
    }
  }
  const tileGeo = tileBatch.build(sceneryMat).geometry;
  const riverGeo = new THREE.PlaneGeometry(BRIDGE_SPAN - 4, 1200).rotateX(-Math.PI / 2);
  const tiles: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(tileGeo, sceneryMat));
    const river = new THREE.Mesh(riverGeo, waterMat);
    river.position.y = 0.15;
    g.add(river);
    // premier pont au bout de ≈ 6 s
    g.position.x = 280 + (i - 1) * TILE;
    scene.add(g);
    tiles.push(g);
  }

  /* ── le train ── */
  const train = makeShinkansen({ cars: 4, shadows: false, noseLength: 4.4 });
  train.group.position.set(0, DECK_Y, 0);
  scene.add(train.group);

  /* ── animation ── */
  let t = 0;
  const lookAt = new THREE.Vector3();

  const update = (dt: number) => {
    t += dt;
    const d = SPEED * dt;

    fieldTex.offset.x = (fieldTex.offset.x + d / GROUND_TILE) % 1;
    waterTex.offset.y = (waterTex.offset.y + dt * 0.25) % 1;
    // les lointains glissent à peine (le Fuji ne bouge pas) : impression de profondeur
    hillsNear.rotation.y += dt * 0.02;
    hillsFar.rotation.y += dt * 0.007;

    for (const g of tiles) {
      g.position.x -= d;
      if (g.position.x < -1.5 * TILE) g.position.x += 3 * TILE;
    }

    // légère vibration du train (très faible : pas d'effet « tremblement »)
    train.group.position.y = DECK_Y + Math.sin(t * 19) * 0.012 + Math.sin(t * 7.3) * 0.008;

    // caméra : lent travelling autour du train, de trois-quarts avant vers le profil
    const a = 0.6 + 0.42 * Math.cos(t * 0.16);
    // écran en portrait : on recule pour garder tout le train dans le cadre
    const R = (27 + 4 * Math.sin(t * 0.11)) * (camera.aspect < 1 ? 1.75 : 1);
    const h = DECK_Y + 3.2 + 1.6 * Math.sin(t * 0.13 + 1) + (camera.aspect < 1 ? 3 : 0);
    camera.position.set(Math.sin(a) * R, h, Math.cos(a) * R);
    lookAt.set(Math.sin(a) * 5, DECK_Y + 2.2, 0);
    camera.lookAt(lookAt);

    const w = canvas.clientWidth || 16;
    const hh = canvas.clientHeight || 9;
    const aspect = w / hh;
    if (Math.abs(camera.aspect - aspect) > 1e-3) {
      camera.aspect = aspect;
      camera.fov = aspect < 1 ? 56 : 38;
      camera.updateProjectionMatrix();
    }
  };
  update(0);

  const dispose = () => {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => mats.add(x));
      else if (mat) mats.add(mat);
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    // les textures du train sont partagées avec la gare de la place : on ne libère que les nôtres
    textures.forEach((x) => x.dispose());
  };

  return { scene, camera, update, dispose };
}
