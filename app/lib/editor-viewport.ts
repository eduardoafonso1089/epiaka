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

/** Fixed pixel geometry: surrounding UI reflow cannot silently change the zoom. */
export function canvasLayout(viewport: { width: number; height: number }, image: { width: number; height: number }, zoom: number, touchNavigation = false) {
  const width = viewport.width * zoom / 100;
  const height = width * image.height / Math.max(1, image.width);
  // A touch gutter lets a finger drag either edge away from the physical edge of the phone.
  // Besides making boundary vertices reachable, it prevents the browser's scroll clamp from
  // making the left/top side feel stuck during two-finger navigation.
  const gutterX = touchNavigation && width > viewport.width ? viewport.width / 2 : 0;
  const gutterY = touchNavigation && height > viewport.height ? viewport.height / 2 : 0;
  return {
    width, height,
    left: gutterX || Math.max(0, (viewport.width - width) / 2),
    top: gutterY || Math.max(0, (viewport.height - height) / 2),
    surfaceWidth: Math.max(viewport.width, width + gutterX * 2),
    surfaceHeight: Math.max(viewport.height, height + gutterY * 2),
  };
}
