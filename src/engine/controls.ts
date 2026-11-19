/**
 * Clavier : flèches, ZQSD (AZERTY) et WASD (QWERTY) — grâce à e.code qui
 * désigne la position physique de la touche, ZQSD et WASD sont les mêmes touches.
 */
export class Controls {
  private keys = new Set<string>();
  enabled = true;
  onInteract: (() => void) | null = null;
  onEscape: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', () => this.keys.clear());
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private down = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && this.enabled) e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (this.enabled && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) this.onInteract?.();
    if (e.code === 'Escape') this.onEscape?.();
  };

  private up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  clear() {
    this.keys.clear();
  }

  /** Axe écran : x = droite(+)/gauche(-), y = haut(+)/bas(-) */
  axis(): { x: number; y: number; run: boolean } {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    const k = this.keys;
    const up = k.has('ArrowUp') || k.has('KeyW');
    const down = k.has('ArrowDown') || k.has('KeyS');
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (up ? 1 : 0) - (down ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 0) {
      x /= l;
      y /= l;
    }
    return { x, y, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }
}
