export type Point2D = { x: number; y: number };
export type Size2D = { width: number; height: number };
export type ScreenFrame = Size2D & { left: number; top: number };

export const DEFAULT_ANNOTATION_SPACE: Readonly<Size2D> = Object.freeze({ width: 1000, height: 650 });

function safeSize(value: number) {
  return Math.max(1, value);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Central coordinate transform for the editor.
 *
 * Annotation coordinates stay in the historical 1000x650 space so existing .plgm,
 * COCO, YOLO and GeoJSON conversion code remains compatible. Rendering/input code
 * can convert explicitly between screen pixels, annotation space and source-image pixels.
 */
export class ViewportTransform {
  constructor(
    readonly frame: ScreenFrame,
    readonly image: Size2D,
    readonly annotation: Size2D = DEFAULT_ANNOTATION_SPACE,
  ) {}

  screenToAnnotation(point: Point2D, clamp = true): Point2D {
    const normalizedX = (point.x - this.frame.left) / safeSize(this.frame.width);
    const normalizedY = (point.y - this.frame.top) / safeSize(this.frame.height);
    return {
      x: (clamp ? clamp01(normalizedX) : normalizedX) * this.annotation.width,
      y: (clamp ? clamp01(normalizedY) : normalizedY) * this.annotation.height,
    };
  }

  annotationToScreen(point: Point2D): Point2D {
    return {
      x: this.frame.left + point.x / safeSize(this.annotation.width) * this.frame.width,
      y: this.frame.top + point.y / safeSize(this.annotation.height) * this.frame.height,
    };
  }

  imageToAnnotation(point: Point2D): Point2D {
    return {
      x: point.x / safeSize(this.image.width) * this.annotation.width,
      y: point.y / safeSize(this.image.height) * this.annotation.height,
    };
  }

  annotationToImage(point: Point2D): Point2D {
    return {
      x: point.x / safeSize(this.annotation.width) * this.image.width,
      y: point.y / safeSize(this.annotation.height) * this.image.height,
    };
  }

  screenToImage(point: Point2D, clamp = true): Point2D {
    return this.annotationToImage(this.screenToAnnotation(point, clamp));
  }

  imageToScreen(point: Point2D): Point2D {
    return this.annotationToScreen(this.imageToAnnotation(point));
  }

  screenDeltaToAnnotation(dx: number, dy: number): Point2D {
    return {
      x: dx * this.annotation.width / safeSize(this.frame.width),
      y: dy * this.annotation.height / safeSize(this.frame.height),
    };
  }
}

export function screenPointToAnnotation(
  point: Point2D,
  frame: ScreenFrame,
  annotation: Size2D = DEFAULT_ANNOTATION_SPACE,
  clamp = true,
) {
  return new ViewportTransform(frame, annotation, annotation).screenToAnnotation(point, clamp);
}

export function annotationPointToScreen(
  point: Point2D,
  frame: ScreenFrame,
  annotation: Size2D = DEFAULT_ANNOTATION_SPACE,
) {
  return new ViewportTransform(frame, annotation, annotation).annotationToScreen(point);
}

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
  const screenDx = x - start.clientX;
  const screenDy = y - start.clientY;
  const transform = new ViewportTransform(
    { left: 0, top: 0, width: start.width, height: start.height },
    DEFAULT_ANNOTATION_SPACE,
  );
  const delta = transform.screenDeltaToAnnotation(screenDx, screenDy);
  return { dx: delta.x, dy: delta.y, moved: Math.hypot(screenDx, screenDy) >= 6 };
}

/** Scroll offset that keeps the same image coordinate under a screen position after zoom. */
export function anchoredScrollOffset(currentScroll: number, canvasClientStart: number, canvasSize: number, anchor: number, pointerClient: number) {
  return currentScroll + canvasClientStart + clamp01(anchor) * canvasSize - pointerClient;
}

/** Fixed pixel geometry: surrounding UI reflow cannot silently change the zoom. */
export function canvasLayout(viewport: Size2D, image: Size2D, zoom: number) {
  const width = viewport.width * zoom / 100;
  const height = width * image.height / safeSize(image.width);
  return {
    width, height,
    left: Math.max(0, (viewport.width - width) / 2),
    top: Math.max(0, (viewport.height - height) / 2),
    surfaceWidth: Math.max(viewport.width, width),
    surfaceHeight: Math.max(viewport.height, height),
  };
}
