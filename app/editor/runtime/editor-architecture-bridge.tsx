"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  InteractionController,
  type InteractionMode,
} from "../interactions/interaction-controller";
import { ViewportController } from "../viewport/viewport-controller";

export type EditorArchitectureContextValue = {
  interaction: InteractionController;
  viewport: ViewportController;
};

const EditorArchitectureContext = createContext<EditorArchitectureContextValue | null>(null);

const DRAW_TOOLS = new Set(["box", "polygon", "ring", "freehand", "line", "point"]);
const MODEL_TOOLS = new Set(["sam"]);

/** Maps the legacy stage tool class to the explicit interaction state machine. */
export function interactionModeForTool(tool: string): Exclude<InteractionMode, "idle"> {
  if (tool === "pan") return "pan";
  if (tool === "select") return "select";
  if (tool === "reshape" || tool === "split") return "edit";
  if (tool === "transform") return "resize";
  if (MODEL_TOOLS.has(tool)) return "model";
  if (DRAW_TOOLS.has(tool)) return "draw";
  return "select";
}

function stageTool(root: HTMLElement | null) {
  const stage = root?.querySelector<HTMLElement>(".stage");
  if (!stage) return "select";
  const known = ["select", "pan", "box", "polygon", "ring", "freehand", "line", "point", "sam", "transform", "reshape", "split"];
  return known.find((tool) => stage.classList.contains(tool)) ?? "select";
}

function targetMode(target: EventTarget | null, root: HTMLElement | null): Exclude<InteractionMode, "idle"> {
  if (!(target instanceof Element)) return interactionModeForTool(stageTool(root));
  if (target.closest(".vertex-handle,.edge-handle,.polygon-close-point,.touch-handle-hit")) return "edit";
  if (target.closest(".box-resize-handle,.box-touch-handle-hit")) return "resize";
  if (target.closest(".rotation-handle")) return "rotate";
  return interactionModeForTool(stageTool(root));
}

/**
 * Adapter around the current editor. The legacy surface remains intact while pointer ownership,
 * viewport state and coordinate conversion are mirrored into the new architecture. Extracted
 * editor components can consume this context without reaching back into the page component.
 */
export function EditorArchitectureBridge({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef(new InteractionController());
  const viewportRef = useRef(new ViewportController({
    viewport: { width: 1000, height: 650 },
    image: { width: 1000, height: 650 },
    zoom: 100,
    scrollLeft: 0,
    scrollTop: 0,
  }));

  const value = useMemo<EditorArchitectureContextValue>(() => ({
    interaction: interactionRef.current,
    viewport: viewportRef.current,
  }), []);

  const syncViewport = () => {
    const root = rootRef.current;
    const scroller = root?.querySelector<HTMLElement>(".scroll");
    const canvas = root?.querySelector<HTMLElement>(".canvas");
    const image = root?.querySelector<HTMLImageElement>("img.image-current");
    if (!scroller) return;

    const viewport = { width: scroller.clientWidth, height: scroller.clientHeight };
    const imageSize = image?.naturalWidth && image?.naturalHeight
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : viewportRef.current.snapshot().image;
    const zoom = canvas?.getBoundingClientRect().width && viewport.width
      ? canvas.getBoundingClientRect().width / viewport.width * 100
      : viewportRef.current.snapshot().zoom;

    viewportRef.current.sync({
      viewport,
      image: imageSize,
      zoom,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    });
  };

  const exposeState = () => {
    const root = rootRef.current;
    if (!root) return;
    const interaction = interactionRef.current.snapshot();
    const viewport = viewportRef.current.snapshot();
    root.dataset.editorMode = interaction.mode;
    root.dataset.editorTool = stageTool(root);
    root.dataset.editorZoom = viewport.zoom.toFixed(2);
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    syncViewport();
    const mode = targetMode(event.target, rootRef.current);
    const active = interactionRef.current.snapshot();
    if (active.mode !== "idle" && !interactionRef.current.owns(event.pointerId)) {
      // Multi-touch navigation is still executed by the existing gesture implementation.
      if (event.pointerType !== "touch") return;
      interactionRef.current.cancel();
    }
    interactionRef.current.begin(mode, { pointerId: event.pointerId });
    exposeState();
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    syncViewport();
    const svg = root.querySelector<SVGSVGElement>(".canvas > svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const transform = viewportRef.current.transform({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    const point = transform.screenToAnnotation({ x: event.clientX, y: event.clientY });
    root.dataset.annotationX = point.x.toFixed(3);
    root.dataset.annotationY = point.y.toFixed(3);
    exposeState();
  };

  const pointerFinish = (event: ReactPointerEvent<HTMLDivElement>) => {
    interactionRef.current.finish(event.pointerId);
    syncViewport();
    exposeState();
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const bind = () => {
      const stage = root.querySelector<HTMLElement>(".stage");
      const scroller = root.querySelector<HTMLElement>(".scroll");
      const canvas = root.querySelector<HTMLElement>(".canvas");
      syncViewport();
      exposeState();

      const stageObserver = stage ? new MutationObserver(() => {
        syncViewport();
        exposeState();
      }) : null;
      if (stage) stageObserver?.observe(stage, { attributes: true, attributeFilter: ["class"] });

      const resize = new ResizeObserver(() => {
        syncViewport();
        exposeState();
      });
      if (scroller) resize.observe(scroller);
      if (canvas) resize.observe(canvas);

      const onScroll = () => {
        syncViewport();
        exposeState();
      };
      scroller?.addEventListener("scroll", onScroll, { passive: true });

      return () => {
        stageObserver?.disconnect();
        resize.disconnect();
        scroller?.removeEventListener("scroll", onScroll);
      };
    };

    let unbind = bind();
    const structureObserver = new MutationObserver(() => {
      unbind();
      unbind = bind();
    });
    structureObserver.observe(root, { childList: true, subtree: true });

    return () => {
      structureObserver.disconnect();
      unbind();
      interactionRef.current.cancel();
    };
  }, []);

  return (
    <EditorArchitectureContext.Provider value={value}>
      <div
        ref={rootRef}
        className="editor-architecture-root"
        style={{ display: "contents" }}
        onPointerDownCapture={pointerDown}
        onPointerMoveCapture={pointerMove}
        onPointerUpCapture={pointerFinish}
        onPointerCancelCapture={pointerFinish}
        onLostPointerCapture={pointerFinish}
      >
        {children}
      </div>
    </EditorArchitectureContext.Provider>
  );
}

export function useEditorArchitecture() {
  const context = useContext(EditorArchitectureContext);
  if (!context) throw new Error("useEditorArchitecture must be used inside EditorArchitectureBridge");
  return context;
}
