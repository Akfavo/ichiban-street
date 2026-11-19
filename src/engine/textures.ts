/**
 * Textures procédurales (Canvas 2D) : enseignes en japonais, façades, sol,
 * distributeurs, étiquettes… Aucune image externe.
 */
import * as THREE from 'three';
import type { ShopStyle } from '../data/cityConfig';

export const JP_FONT =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", "MS Gothic", system-ui, sans-serif';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const t = make();
  cache.set(key, t);
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ajuste la taille de police pour que le texte tienne dans maxW */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = '800') {
  let s = size;
  ctx.font = `${weight} ${s}px ${JP_FONT}`;
  while (ctx.measureText(text).width > maxW && s > 8) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${JP_FONT}`;
  }
  return s;
}

/* ───────────────────────────── Enseignes ───────────────────────────── */

export function signTexture(text: string, sub: string | undefined, bg: string, fg: string, accent?: string, aspect = 4): THREE.CanvasTexture {
  return cached(`sign:${text}:${sub}:${bg}:${fg}:${accent}:${aspect}`, () => {
    const h = 256;
    const w = Math.round(h * aspect);
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // léger dégradé lumineux
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, h - 22, w, 22);
      ctx.fillRect(0, 0, w, 10);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mainY = sub ? h * 0.43 : h * 0.52;
    fitFont(ctx, text, w * 0.9, sub ? 150 : 175, '900');
    ctx.fillText(text, w / 2, mainY);
    if (sub) {
      fitFont(ctx, sub, w * 0.85, 46, '700');
      ctx.globalAlpha = 0.92;
      ctx.fillText(sub, w / 2, h * 0.8);
      ctx.globalAlpha = 1;
    }
    return toTexture(c);
  });
}

/** Enseigne verticale (tategaki) : un caractère par ligne */
export function verticalSignTexture(text: string, bg: string, fg: string, accent?: string): THREE.CanvasTexture {
  return cached(`vsign:${text}:${bg}:${fg}:${accent}`, () => {
    const chars = [...text.replace(/[・\s]/g, '')];
    const w = 160;
    const cell = 150;
    const h = Math.max(1, chars.length) * cell + 40;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (accent) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, w - 12, h - 12);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 118px ${JP_FONT}`;
    chars.forEach((ch, i) => {
      const y = 20 + cell * i + cell / 2;
      if (ch === 'ー' || ch === '―' || ch === '〜') {
        ctx.save();
        ctx.translate(w / 2, y);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(ch, w / 2, y);
      }
    });
    return toTexture(c);
  });
}

/** Panneau générique (texte multi-lignes) */
export function panelTexture(lines: string[], bg: string, fg: string, w = 512, h = 256, size = 80): THREE.CanvasTexture {
  return cached(`panel:${lines.join('|')}:${bg}:${fg}:${w}:${h}:${size}`, () => {
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = h / lines.length;
    lines.forEach((l, i) => {
      fitFont(ctx, l, w * 0.9, size, '800');
      ctx.fillText(l, w / 2, lh * i + lh / 2);
    });
    return toTexture(c);
  });
}

/** tableau des départs du shinkansen : « 駅前 ゆき » en grand, puis la lecture et le français */
export function departureTexture(destJp: string, yomi: string, fr: string): THREE.CanvasTexture {
  return cached(`depart:${destJp}:${yomi}:${fr}`, () => {
    const w = 1024;
    const h = 400;
    const [c, ctx] = canvas(w, h);
    ctx.fillStyle = '#0f1a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f5fbf';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // destination + ゆき (jaune, très gros)
    ctx.fillStyle = '#ffd23f';
    fitFont(ctx, `${destJp} ゆき`, w * 0.9, 170, '900');
    ctx.fillText(`${destJp} ゆき`, w / 2, h * 0.38);
    // lecture + français (blanc)
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, `${yomi} ゆき  →  ${fr}`, w * 0.9, 64, '800');
    ctx.fillText(`${yomi} ゆき  →  ${fr}`, w / 2, h * 0.78);
    return toTexture(c);
  });
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

export function stripeTexture(a: string, b: string, stripes = 8): THREE.CanvasTexture {
  return cached(`stripe:${a}:${b}:${stripes}`, () => {
    const [c, ctx] = canvas(256, 64);
    const sw = 256 / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect(i * sw, 0, sw, 64);
    }
    // bord festonné
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 56, 256, 8);
    return toTexture(c);
  });
}

/** Façade : grille de fenêtres sur un mur */
export function facadeTexture(wall: string, win: string, trim: string, cols = 4, rows = 3, lit = 0.35, seed = 1): THREE.CanvasTexture {
  return cached(`facade:${wall}:${win}:${trim}:${cols}:${rows}:${lit}:${seed}`, () => {
    const W = 512;
    const H = 512;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    // grain
    const rnd = mulberry(seed);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`;
      ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    // bandeaux d'étage
    ctx.fillStyle = shade(wall, -0.08);
    for (let r = 1; r < rows; r++) ctx.fillRect(0, (H / rows) * r - 4, W, 8);
    const cw = W / cols;
    const rh = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw + cw * 0.16;
        const y = r * rh + rh * 0.2;
        const w = cw * 0.68;
        const h = rh * 0.56;
        ctx.fillStyle = trim;
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
        const on = rnd() < lit;
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, on ? '#fff1c4' : shade(win, 0.15));
        g.addColorStop(1, on ? '#ffc874' : shade(win, -0.2));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.7);
        ctx.lineTo(x + w * 0.5, y);
        ctx.lineTo(x + w * 0.7, y);
        ctx.lineTo(x, y + h);
        ctx.fill();
        ctx.fillStyle = trim;
        ctx.fillRect(x + w / 2 - 2, y, 4, h);
      }
    }
    return toTexture(c);
  });
}

/** Devanture vitrée éclairée de l'intérieur, avec des silhouettes de rayons selon le style */
export function storefrontTexture(style: ShopStyle, glass: string, trim: string): THREE.CanvasTexture {
  return cached(`front:${style}:${glass}:${trim}`, () => {
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(1, glass);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rnd = mulberry(style.length * 7);
    const palette: Record<string, string[]> = {
      konbini: ['#f2c14e', '#e85d4a', '#4aa3df', '#6cc070', '#ffffff'],
      ramen: ['#7a3b1d', '#c9772b', '#f2d29b'],
      bank: ['#d6dde6', '#9fb2c8', '#ffffff'],
      telecom: ['#222', '#555', '#ff7a00', '#ffffff'],
      electronics: ['#111', '#333', '#e60012', '#ffd400', '#2b6fdb'],
      games: ['#e33', '#3bd', '#fd3', '#a3f', '#3d6'],
      figures: ['#ff7fbf', '#7fd1ff', '#ffe27f', '#c59bff', '#ffffff'],
      pharmacy: ['#ffffff', '#ffe600', '#4fb87e', '#ff8a8a'],
      bakery: ['#d99a4e', '#b8732f', '#f1c27d', '#8a4f22', '#f6e0b0'],
      station: ['#cfd8df'],
      hotel: ['#f2e6cf', '#c9a25b', '#7a5c3a', '#ffffff'],
      shokudo: ['#f2d29b', '#c9772b', '#ffffff', '#2f4a3a'],
      koban: ['#24365e', '#ffffff', '#cfd8df'],
    };
    const cols = palette[style] ?? ['#ccc'];
    // étagères
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 50 + shelf * 62;
      ctx.fillStyle = 'rgba(80,70,60,0.35)';
      ctx.fillRect(0, y + 40, W, 6);
      for (let x = 8; x < W - 20; ) {
        const w = 10 + rnd() * 22;
        const h = 18 + rnd() * 22;
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        if (style === 'ramen') {
          // comptoir + bols
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + 34, w / 2, 8, 0, 0, Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(x, y + 40 - h, w, h);
        }
        x += w + 4 + rnd() * 6;
      }
    }
    // reflets
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 3; i++) {
      const x = 60 + i * 170;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 70, 0);
      ctx.lineTo(x + 100, 0);
      ctx.lineTo(x + 30, H);
      ctx.fill();
    }
    // montants
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, W, 8);
    ctx.fillRect(0, H - 8, W, 8);
    for (let i = 0; i <= 4; i++) ctx.fillRect((W / 4) * i - 4, 0, 8, H);
    return toTexture(c);
  });
}

export function tileTexture(base: string, line: string, tiles = 8): THREE.CanvasTexture {
  return cached(`tile:${base}:${line}:${tiles}`, () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    const rnd = mulberry(tiles * 13);
    const ts = S / tiles;
    for (let i = 0; i < tiles; i++)
      for (let j = 0; j < tiles; j++) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.05})`;
        ctx.fillRect(i * ts, j * ts, ts, ts);
      }
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath();
      ctx.moveTo(i * ts, 0);
      ctx.lineTo(i * ts, S);
      ctx.moveTo(0, i * ts);
      ctx.lineTo(S, i * ts);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

export function asphaltTexture(): THREE.CanvasTexture {
  return cached('asphalt', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, 0, S, S);
    const rnd = mulberry(42);
    for (let i = 0; i < 4000; i++) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${rnd() * 0.12})` : `rgba(255,255,255,${rnd() * 0.07})`;
      ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    return toTexture(c);
  });
}

/** Tactile paving jaune (dalles podotactiles japonaises) */
export function tactileTexture(): THREE.CanvasTexture {
  return cached('tactile', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 4; i++) ctx.fillRect(14 + i * 30, 10, 10, S - 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(1, 1, S - 2, S - 2);
    return toTexture(c);
  });
}

/* ───────────────────────────── Accessoires ───────────────────────────── */

export function vendingTexture(color: string, seed: number): THREE.CanvasTexture {
  return cached(`vend:${color}:${seed}`, () => {
    const W = 256;
    const H = 512;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    // vitrine
    ctx.fillStyle = '#fdfdf8';
    roundRect(ctx, 16, 24, W - 32, 270, 10);
    ctx.fill();
    const rnd = mulberry(seed * 31 + 7);
    const can = ['#d9232e', '#1f5fbf', '#f28c1e', '#2e9d58', '#7a4b2a', '#f2d230', '#e0e0e0', '#111'];
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 6; k++) {
        const x = 30 + k * 34;
        const y = 40 + r * 64;
        ctx.fillStyle = can[Math.floor(rnd() * can.length)];
        roundRect(ctx, x, y, 22, 40, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x + 4, y + 4, 4, 30);
        ctx.fillStyle = '#27c94a';
        ctx.fillRect(x, y + 48, 22, 6);
      }
    }
    // texte
    ctx.fillStyle = shade(color, -0.25);
    ctx.fillRect(16, 306, W - 32, 46);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 30px ${JP_FONT}`;
    ctx.fillText('つめた〜い', W / 2, 330);
    // fente & bac
    ctx.fillStyle = '#222';
    roundRect(ctx, W - 90, 380, 52, 70, 6);
    ctx.fill();
    ctx.fillStyle = '#14d2ff';
    ctx.fillRect(W - 84, 388, 40, 14);
    ctx.fillStyle = '#1b1b1b';
    roundRect(ctx, 30, 460, W - 60, 36, 6);
    ctx.fill();
    return toTexture(c);
  });
}

/** Étiquette flottante (nom du PNJ) */
export function labelTexture(icon: string, text: string, done: boolean): THREE.CanvasTexture {
  // pas de cache : on la régénère à la complétion
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.font = `800 54px ${JP_FONT}`;
  const label = `${icon} ${text}${done ? ' ✓' : ''}`;
  const tw = Math.min(W - 20, ctx.measureText(label).width + 56);
  const x = (W - tw) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x + 3, 17, tw, 92, 46);
  ctx.fill();
  ctx.fillStyle = done ? '#2f9e5b' : 'rgba(255,255,255,0.95)';
  roundRect(ctx, x, 12, tw, 92, 46);
  ctx.fill();
  ctx.fillStyle = done ? '#ffffff' : '#2b2b33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, 60, W - 40);
  return toTexture(c);
}

export function glowTexture(color = '#ffffff'): THREE.CanvasTexture {
  return cached(`glow:${color}`, () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.35, hexA(color, 0.55));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTexture(c);
  });
}

/** Ombre de contact douce */
export function blobShadowTexture(): THREE.CanvasTexture {
  return cached('blob', () => {
    const S = 128;
    const [c, ctx] = canvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTexture(c);
  });
}

export function clockTexture(): THREE.CanvasTexture {
  return cached('clock', () => {
    const S = 256;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = '#fbfaf5';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2b2f36';
    ctx.stroke();
    ctx.fillStyle = '#2b2f36';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.translate(S / 2 + Math.sin(a) * 100, S / 2 - Math.cos(a) * 100);
      ctx.rotate(a);
      ctx.fillRect(-3, -10, 6, i % 3 === 0 ? 22 : 14);
      ctx.restore();
    }
    const hand = (a: number, len: number, w: number) => {
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(a);
      ctx.fillRect(-w / 2, -len, w, len + 10);
      ctx.restore();
    };
    hand((5 / 12) * Math.PI * 2 + 0.2, 60, 10);
    hand((50 / 60) * Math.PI * 2, 88, 6);
    ctx.fillStyle = '#c22b2b';
    hand(Math.PI * 0.7, 92, 3);
    return toTexture(c);
  });
}

export function norenTexture(color: string, text: string): THREE.CanvasTexture {
  return cached(`noren:${color}:${text}`, () => {
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 4; i++) ctx.fillRect((W / 4) * i - 3, 40, 6, H);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    ctx.font = `900 120px ${JP_FONT}`;
    chars.forEach((ch, i) => ctx.fillText(ch, (W / chars.length) * (i + 0.5), H * 0.55));
    return toTexture(c);
  });
}

export function lanternTexture(text: string): THREE.CanvasTexture {
  return cached(`lantern:${text}`, () => {
    const W = 256;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#9e1b14');
    g.addColorStop(0.5, '#ff4a35');
    g.addColorStop(1, '#9e1b14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 32, W, 3);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, 20);
    ctx.fillRect(0, H - 20, W, 20);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 120px ${JP_FONT}`;
    ctx.fillText(text, W / 4, H / 2);
    ctx.fillText(text, (W * 3) / 4, H / 2);
    return toTexture(c);
  });
}

/** Écran LED (vitrine électronique / jeux) */
export function screenTexture(lines: string[], bg: string, fg: string, accent: string): THREE.CanvasTexture {
  return cached(`screen:${lines.join('|')}:${bg}:${fg}:${accent}`, () => {
    const W = 512;
    const H = 288;
    const [c, ctx] = canvas(W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg);
    g.addColorStop(1, shade(bg, -0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(W * 0.82, H * 0.3, 70, 0, Math.PI * 2);
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      fitFont(ctx, l, W * 0.85, i === 0 ? 86 : 48, '900');
      ctx.fillText(l, 30, 80 + i * 90);
    });
    // trame LED
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    return toTexture(c);
  });
}

/** Grand panneau d'information de la gare (départs) */
export function departureBoardTexture(): THREE.CanvasTexture {
  return cached('departures', () => {
    const W = 512;
    const H = 192;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    const rows = [
      ['かいそく', '10:24', 'とうきょう', '#ff9a3c'],
      ['ふつう', '10:31', 'しんじゅく', '#7fe07f'],
      ['とっきゅう', '10:40', 'よこはま', '#ff5a5a'],
    ];
    ctx.font = `800 40px ${JP_FONT}`;
    rows.forEach((r, i) => {
      const y = 36 + i * 60;
      ctx.fillStyle = r[3];
      ctx.fillText(r[0], 18, y);
      ctx.fillStyle = '#ffd84a';
      ctx.fillText(r[1], 230, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(r[2], 350, y, 150);
    });
    return toTexture(c);
  });
}

/* ───────────────────────────── Couleurs ───────────────────────────── */

export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  if (amt >= 0) c.lerp(new THREE.Color('#ffffff'), amt);
  else c.lerp(new THREE.Color('#000000'), -amt);
  return `#${c.getHexString()}`;
}

function hexA(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
