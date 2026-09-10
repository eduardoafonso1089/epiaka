/** Canvas touch arbitration, independent of React and image coordinate systems. */
export class TouchGesture {
  readonly points = new Map<number, { x: number; y: number }>();
  private origin: { x: number; y: number } | null = null;
  private moved = false;
  navigating = false;

  down(id: number, x: number, y: number, isPrimary = false) {
    // A primary pointer starts a new physical touch sequence. Discard orphaned IDs
    // from a release outside the editor or a removed capture target.
    if (isPrimary) this.points.clear();
    if (!this.points.size) {
      this.origin = { x, y };
      this.moved = false;
      this.navigating = false;
    }
    this.points.set(id, { x, y });
    if (this.points.size > 1) this.navigating = true;
    return this.navigating;
  }

  move(id: number, x: number, y: number) {
    if (!this.points.has(id)) return;
    this.points.set(id, { x, y });
    if (this.origin && Math.hypot(x - this.origin.x, y - this.origin.y) > 8) this.moved = true;
  }

  end(id: number, cancelled = false) {
    const tracked = this.points.delete(id);
    const blocked = this.navigating || cancelled;
    const tap = tracked && !blocked && !this.moved;
    // Keep navigation locked until EVERY finger lifts, including after cancellation.
    if (cancelled) this.navigating = true;
    if (!this.points.size) this.navigating = false;
    return { tracked, blocked, tap };
  }

  pair() {
    const [a, b] = this.points.values();
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
}

export function pinchZoom(initialZoom: number, initialDistance: number, distance: number) {
  return Math.max(10, Math.min(400, Math.round(initialZoom * distance / Math.max(1, initialDistance))));
}

export function touchToolUsesTap(tool: string) {
  return ["polygon", "ring", "line", "point", "sam", "split"].includes(tool);
}

/** Choose the closest vertex in screen pixels when expanded touch targets overlap. */
export function nearestTouchVertex(points: number[], x: number, y: number, width: number, height: number, radius = 22) {
  let closest = -1;
  let distance = radius;
  for (let i = 0; i < points.length; i += 2) {
    const candidate = Math.hypot((points[i] - x) * width / 1000, (points[i + 1] - y) * height / 650);
    if (candidate <= distance) { closest = i / 2; distance = candidate; }
  }
  return closest;
}
