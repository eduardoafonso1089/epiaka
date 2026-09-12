"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ViewportController, type ViewportState } from "./viewport-controller";
import type { Size2D } from "../../lib/editor-viewport";

export type UseEditorViewportOptions = {
  image: Size2D;
  initialZoom?: number;
};

export function useEditorViewport({ image, initialZoom = 92 }: UseEditorViewportOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const controllerRef = useRef(new ViewportController({
    viewport: { width: 1000, height: 650 },
    image,
    zoom: initialZoom,
    scrollLeft: 0,
    scrollTop: 0,
  }));
  const [state, setState] = useState<ViewportState>(() => controllerRef.current.snapshot());

  const syncViewport = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return controllerRef.current.snapshot();
    const next = controllerRef.current.sync({
      viewport: { width: scroller.clientWidth || 1, height: scroller.clientHeight || 1 },
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    });
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    controllerRef.current.setImage(image);
    setState(controllerRef.current.snapshot());
  }, [image.height, image.width]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(syncViewport);
    observer.observe(scroller);
    syncViewport();
    return () => observer.disconnect();
  }, [syncViewport]);

  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    controllerRef.current.setScroll(scroller.scrollLeft, scroller.scrollTop);
    setState(controllerRef.current.snapshot());
  }, []);

  const applyScroll = useCallback((next: ViewportState) => {
    requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      scroller.scrollLeft = next.scrollLeft;
      scroller.scrollTop = next.scrollTop;
    });
  }, []);

  const zoomTo = useCallback((zoom: number, clientPoint?: { x: number; y: number }) => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scroller) return;
    controllerRef.current.sync({
      viewport: { width: scroller.clientWidth || 1, height: scroller.clientHeight || 1 },
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    });

    let next: ViewportState;
    if (canvas && clientPoint) {
      const rect = canvas.getBoundingClientRect();
      next = controllerRef.current.zoomAt(
        zoom,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        clientPoint,
      );
    } else {
      controllerRef.current.setZoom(zoom);
      next = controllerRef.current.snapshot();
    }
    setState(next);
    applyScroll(next);
  }, [applyScroll]);

  const zoomBy = useCallback((delta: number) => {
    const scroller = scrollRef.current;
    const point = scroller
      ? { x: scroller.getBoundingClientRect().left + scroller.clientWidth / 2, y: scroller.getBoundingClientRect().top + scroller.clientHeight / 2 }
      : undefined;
    zoomTo(state.zoom + delta, point);
  }, [state.zoom, zoomTo]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomTo(state.zoom + (event.deltaY < 0 ? 10 : -10), { x: event.clientX, y: event.clientY });
  }, [state.zoom, zoomTo]);

  useLayoutEffect(() => {
    const next = controllerRef.current.snapshot();
    applyScroll(next);
  }, [applyScroll, state.zoom]);

  return {
    scrollRef,
    canvasRef,
    state,
    layout: controllerRef.current.layout(),
    onScroll,
    onWheel,
    zoomTo,
    zoomBy,
    syncViewport,
  };
}
