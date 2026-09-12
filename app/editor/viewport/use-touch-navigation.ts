"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { TouchGesture, pinchZoom } from "../../lib/touch-gestures";

export type TouchNavigationOptions = {
  tool: string;
  zoom: number;
  maxZoom?: number;
  panBy: (pointerDx: number, pointerDy: number) => void;
  pinchPan: (
    zoom: number,
    previousCenter: { x: number; y: number },
    currentCenter: { x: number; y: number },
  ) => void;
  cancelEditing: () => void;
  cancelDrawing: () => void;
};

type PinchState = {
  initialZoom: number;
  initialDistance: number;
  previousCenter: { x: number; y: number };
};

type PanState = {
  pointerId: number;
  last: { x: number; y: number };
};

export function useTouchNavigation({
  tool,
  zoom,
  maxZoom = Number.POSITIVE_INFINITY,
  panBy,
  pinchPan,
  cancelEditing,
  cancelDrawing,
}: TouchNavigationOptions) {
  const gestureRef = useRef(new TouchGesture());
  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [touchMode, setTouchMode] = useState(false);

  const onPointerDownCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch") return;
    setTouchMode(true);

    const gesture = gestureRef.current;
    const becameNavigation = gesture.down(event.pointerId, event.clientX, event.clientY, event.isPrimary);

    if (becameNavigation) {
      cancelEditing();
      cancelDrawing();
      panRef.current = null;
      const pair = gesture.pair();
      if (pair) {
        pinchRef.current = {
          initialZoom: zoom,
          initialDistance: pair.distance,
          previousCenter: { x: pair.x, y: pair.y },
        };
      }
      setNavigating(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (tool === "pan") {
      panRef.current = {
        pointerId: event.pointerId,
        last: { x: event.clientX, y: event.clientY },
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    }
  }, [cancelDrawing, cancelEditing, tool, zoom]);

  const onPointerMoveCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch") return;
    const gesture = gestureRef.current;
    if (!gesture.points.has(event.pointerId)) return;
    gesture.move(event.pointerId, event.clientX, event.clientY);

    if (gesture.navigating) {
      const pair = gesture.pair();
      const pinch = pinchRef.current;
      if (pair && pinch) {
        const nextZoom = pinchZoom(pinch.initialZoom, pinch.initialDistance, pair.distance, maxZoom);
        const currentCenter = { x: pair.x, y: pair.y };
        pinchPan(nextZoom, pinch.previousCenter, currentCenter);
        pinch.previousCenter = currentCenter;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const pan = panRef.current;
    if (tool === "pan" && pan?.pointerId === event.pointerId) {
      const dx = event.clientX - pan.last.x;
      const dy = event.clientY - pan.last.y;
      if (dx || dy) panBy(dx, dy);
      pan.last = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      event.stopPropagation();
    }
  }, [maxZoom, panBy, pinchPan, tool]);

  const finishTouch = useCallback((event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    if (event.pointerType !== "touch") return;
    const gesture = gestureRef.current;
    if (!gesture.points.has(event.pointerId)) return;

    const wasNavigating = gesture.navigating;
    const wasPan = panRef.current?.pointerId === event.pointerId;
    gesture.end(event.pointerId, cancelled);

    if (wasPan) panRef.current = null;
    if (!gesture.points.size) {
      pinchRef.current = null;
      setNavigating(false);
    }

    if (wasNavigating || wasPan || cancelled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const onPointerUpCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    finishTouch(event, false);
  }, [finishTouch]);

  const onPointerCancelCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    cancelEditing();
    cancelDrawing();
    finishTouch(event, true);
  }, [cancelDrawing, cancelEditing, finishTouch]);

  return {
    navigating,
    touchMode,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
  };
}
