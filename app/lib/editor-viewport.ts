/** Automatic fitting is allowed once per image, never after the user interacts. */
export class ImageFraming {
  private image: string | null = null;
  keep(imageId: string) { this.image = imageId; }
  fit(imageId: string, ready: boolean) {
    if (!ready || this.image === imageId) return false;
    this.image = imageId;
    return true;
  }
}

/** Drag deltas use the frame at pointerdown, not layout changes after selection. */
export function annotationPointerDelta(start: { clientX: number; clientY: number; width: number; height: number }, x: number, y: number) {
  const dx = x - start.clientX;
  const dy = y - start.clientY;
  return { dx: dx * 1000 / Math.max(1, start.width), dy: dy * 650 / Math.max(1, start.height), moved: Math.hypot(dx, dy) >= 6 };
}
