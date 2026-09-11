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

/** Scroll offset that keeps the same image coordinate under a screen position after zoom. */
export function anchoredScrollOffset(currentScroll: number, canvasClientStart: number, canvasSize: number, anchor: number, pointerClient: number) {
  return currentScroll + canvasClientStart + Math.max(0, Math.min(1, anchor)) * canvasSize - pointerClient;
}

/** Fixed pixel geometry: surrounding UI reflow cannot silently change the zoom. */
export function canvasLayout(viewport: { width: number; height: number }, image: { width: number; height: number }, zoom: number) {
  const width = viewport.width * zoom / 100;
  const height = width * image.height / Math.max(1, image.width);
  return {
    width, height,
    left: Math.max(0, (viewport.width - width) / 2),
    top: Math.max(0, (viewport.height - height) / 2),
    surfaceWidth: Math.max(viewport.width, width),
    surfaceHeight: Math.max(viewport.height, height),
  };
}
