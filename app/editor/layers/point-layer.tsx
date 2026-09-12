"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { Annotation } from "../../lib/types";

type Props = {
  annotation: Annotation;
  color: string;
  selected: boolean;
  selecting: boolean;
  markerRadius: number;
  markerAspect: number;
  onPointerDown: (event: ReactPointerEvent<SVGElement>, annotation: Annotation) => void;
  onPointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGElement>) => void;
  onPointerCancel: () => void;
};

export function PointLayer({ annotation, color, selected, selecting, markerRadius, markerAspect, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: Props) {
  const radius = markerRadius * (selected ? 1.32 : 1);
  return (
    <g
      className={selecting ? "movable-annotation" : ""}
      onPointerDown={(event) => onPointerDown(event, annotation)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <ellipse cx={annotation.x} cy={annotation.y} rx={radius} ry={radius * markerAspect} fill="#fff" stroke={color} strokeWidth={radius * .42} />
      <ellipse cx={annotation.x} cy={annotation.y} rx={radius * .34} ry={radius * .34 * markerAspect} fill={color} />
    </g>
  );
}
