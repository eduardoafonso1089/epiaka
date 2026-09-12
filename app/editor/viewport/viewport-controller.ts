import {
  DEFAULT_ANNOTATION_SPACE,
  ViewportTransform,
  anchoredScrollOffset,
  canvasLayout,
  type Point2D,
  type ScreenFrame,
  type Size2D,
} from "../../lib/editor-viewport";

export type ViewportState = {
  viewport: Size2D;
  image: Size2D;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

/** Pure viewport model. DOM adapters can use this without embedding layout math in components. */
export class ViewportController {
  constructor(private state: ViewportState) {}

  snapshot(): ViewportState {
    return { ...this.state, viewport: { ...this.state.viewport }, image: { ...this.state.image } };
  }

  layout() {
    return canvasLayout(this.state.viewport, this.state.image, this.state.zoom);
  }

  transform(frame: ScreenFrame) {
    return new ViewportTransform(frame, this.state.image, DEFAULT_ANNOTATION_SPACE);
  }

  setViewport(viewport: Size2D) {
    this.state = { ...this.state, viewport: { ...viewport } };
  }

  setImage(image: Size2D) {
    this.state = { ...this.state, image: { ...image } };
  }

  setScroll(scrollLeft: number, scrollTop: number) {
    this.state = { ...this.state, scrollLeft, scrollTop };
  }

  zoomAt(nextZoom: number, frame: ScreenFrame, pointer: Point2D) {
    const target = Math.max(10, Math.min(400, Math.round(nextZoom)));
    if (target === this.state.zoom) return this.snapshot();

    const anchorX = Math.max(0, Math.min(1, (pointer.x - frame.left) / Math.max(1, frame.width)));
    const anchorY = Math.max(0, Math.min(1, (pointer.y - frame.top) / Math.max(1, frame.height)));
    const oldLayout = this.layout();
    const nextLayout = canvasLayout(this.state.viewport, this.state.image, target);

    const oldCanvasLeft = frame.left;
    const oldCanvasTop = frame.top;
    const nextCanvasLeft = oldCanvasLeft + nextLayout.left - oldLayout.left;
    const nextCanvasTop = oldCanvasTop + nextLayout.top - oldLayout.top;

    this.state = {
      ...this.state,
      zoom: target,
      scrollLeft: anchoredScrollOffset(this.state.scrollLeft, nextCanvasLeft, nextLayout.width, anchorX, pointer.x),
      scrollTop: anchoredScrollOffset(this.state.scrollTop, nextCanvasTop, nextLayout.height, anchorY, pointer.y),
    };

    return this.snapshot();
  }
}
