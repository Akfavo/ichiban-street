import * as THREE from 'three';

/**
 * Ambiance « cosy » commune aux deux quartiers :
 *  - ombres de nuages qui glissent lentement au sol (le jour seulement) ;
 *  - pétales de sakura portés par le vent autour de la caméra (le jour).
 */

/* ───────────────────────── ombres de nuages ───────────────────────── */

/** texture de nuages douce et raccordable (bords qui se répètent sans couture) */
function cloudTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // quelques gros nuages faits de bulles floues ; chaque bulle est recopiée
  // sur les bords opposés pour que la texture se répète sans raccord visible
  for (let n = 0; n < 5; n++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    for (let b = 0; b < 7; b++) {
      const x = cx + (rnd() - 0.5) * 70;
      const y = cy + (rnd() - 0.5) * 40;
      const r = 22 + rnd() * 26;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, 'rgba(255,255,255,0.55)');
          g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

const cloudUniforms = {
  cloudMap: { value: null as THREE.Texture | null },
  cloudOffset: { value: new THREE.Vector2() },
  cloudStrength: { value: 0 },
};

/** taille d'un motif de nuages au sol (unités monde) */
const CLOUD_TILE = 60;
/** vent : direction et vitesse (unités / s) */
const WIND = new THREE.Vector2(0.55, 0.32);

const patched = new WeakSet<THREE.Material>();

/** ajoute l'ombre des nuages à un matériau éclairé (une seule fois) */
function patchMaterial(m: THREE.Material) {
  if (patched.has(m)) return;
  if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshToonMaterial)) return;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
  patched.add(m);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cloudUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 cw = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
          #endif
          vCloudW = ( modelMatrix * cw ).xz;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudW;\nuniform sampler2D cloudMap;\nuniform vec2 cloudOffset;\nuniform float cloudStrength;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        if ( cloudStrength > 0.0 ) {
          float cs = texture2D( cloudMap, vCloudW * ${(1 / CLOUD_TILE).toFixed(6)} + cloudOffset ).r;
          float ck = 1.0 - cloudStrength * smoothstep( 0.08, 0.7, cs );
          reflectedLight.directDiffuse *= ck;
          reflectedLight.directSpecular *= ck;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'cloud';
  m.needsUpdate = true;
}

/* ───────────────────────── pétales ───────────────────────── */

const PETALS = 140;
/** demi-taille de la zone de pétales autour de la caméra */
const R = 24;
const TOP = 11;

export class Atmosphere {
  private petals: THREE.InstancedMesh;
  private pData: { x: number; y: number; z: number; ph: number; sp: number; fall: number; rx: number; ry: number }[] = [];
  private dummy = new THREE.Object3D();
  private cloud = cloudTexture();

  constructor(private scene: THREE.Scene) {
    cloudUniforms.cloudMap.value = this.cloud;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffc6d6', roughness: 0.75, side: THREE.DoubleSide, emissive: '#ff9ab8', emissiveIntensity: 0.12 });
    const geo = new THREE.PlaneGeometry(0.14, 0.1);
    this.petals = new THREE.InstancedMesh(geo, mat, PETALS);
    this.petals.frustumCulled = false;
    this.petals.castShadow = false;
    this.petals.receiveShadow = false;
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < PETALS; i++) {
      this.pData.push({
        x: (rnd() * 2 - 1) * R,
        y: rnd() * TOP,
        z: (rnd() * 2 - 1) * R,
        ph: rnd() * Math.PI * 2,
        sp: 0.7 + rnd() * 0.6,
        fall: 0.35 + rnd() * 0.35,
        rx: rnd() * 3,
        ry: rnd() * 3,
      });
    }
    scene.add(this.petals);
  }

  /** applique l'ombre des nuages à tous les matériaux éclairés de la scène */
  patchScene() {
    this.scene.traverse((o) => {
      const mm = (o as THREE.Mesh).material;
      if (!mm) return;
      for (const m of Array.isArray(mm) ? mm : [mm]) patchMaterial(m);
    });
  }

  /** f : 0 = jour → 1 = nuit ; focus : centre de la vue */
  update(t: number, dt: number, focus: THREE.Vector3, f: number) {
    const day = 1 - f;
    // nuages : lents, présents seulement le jour (s'effacent avec le soleil)
    cloudUniforms.cloudOffset.value.set((-t * WIND.x) / CLOUD_TILE, (-t * WIND.y) / CLOUD_TILE);
    cloudUniforms.cloudStrength.value = 0.4 * day * day;

    // pétales : coordonnées « enroulées » autour du centre de la vue, avec un
    // fondu près des bords de la zone pour qu'aucun pétale n'apparaisse d'un coup
    const vis = day > 0.02;
    this.petals.visible = vis;
    if (!vis) return;
    const d = this.dummy;
    const wrap = (v: number) => ((((v + R) % (2 * R)) + 2 * R) % (2 * R)) - R;
    for (let i = 0; i < PETALS; i++) {
      const p = this.pData[i];
      const gust = 0.75 + 0.35 * Math.sin(t * 0.23 + p.ph * 0.3);
      p.x += (WIND.x * 2.2 * gust + Math.sin(t * p.sp + p.ph) * 0.35) * dt;
      p.z += (WIND.y * 2.2 * gust + Math.cos(t * p.sp * 0.8 + p.ph) * 0.25) * dt;
      p.y -= p.fall * dt;
      if (p.y < 0) p.y += TOP;
      const lx = wrap(p.x - focus.x);
      const lz = wrap(p.z - focus.z);
      const edge = Math.min(1, (R - Math.abs(lx)) / 4, (R - Math.abs(lz)) / 4, p.y / 0.6, (TOP - p.y) / 1.2);
      d.position.set(focus.x + lx, p.y + 0.1, focus.z + lz);
      d.rotation.set(p.rx + t * p.sp * 1.3, p.ry + t * p.sp, Math.sin(t * 2 * p.sp + p.ph) * 0.8);
      d.scale.setScalar(Math.max(0.001, edge * day));
      d.updateMatrix();
      this.petals.setMatrixAt(i, d.matrix);
    }
    this.petals.instanceMatrix.needsUpdate = true;
  }
}
