"use client";

import { getCopy } from "../../lib/i18n";
import type { VectorTool } from "../commands/editor-shortcuts";

type Copy = ReturnType<typeof getCopy>;

export function VectorToolbar({
  copy,
  snapEnabled,
  vectorTool,
  canSimplify,
  canMerge,
  canEditPolygon,
  onToggleSnap,
  onSimplify,
  onMerge,
  onVectorTool,
}: {
  copy: Copy;
  snapEnabled: boolean;
  vectorTool: VectorTool;
  canSimplify: boolean;
  canMerge: boolean;
  canEditPolygon: boolean;
  onToggleSnap: () => void;
  onSimplify: () => void;
  onMerge: () => void;
  onVectorTool: (tool: VectorTool) => void;
}) {
  const toolButton = (id: Exclude<VectorTool, null>, label: string, disabled = false) => <button
    type="button"
    aria-pressed={vectorTool === id}
    disabled={disabled}
    onClick={() => onVectorTool(vectorTool === id ? null : id)}
    style={{ fontWeight: vectorTool === id ? 700 : 400 }}
  >{label}</button>;

  return <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
    <button type="button" aria-pressed={snapEnabled} onClick={onToggleSnap}>{snapEnabled ? copy.snapOn : copy.snapOff}</button>
    <button type="button" disabled={!canSimplify} onClick={onSimplify}>{copy.simplify}</button>
    <button type="button" disabled={!canMerge} onClick={onMerge}>{copy.merge}</button>
    {toolButton("hole", "Buraco (O)", !canEditPolygon)}
    {toolButton("split", `${copy.split} (X)`, !canEditPolygon)}
    {toolButton("reshape", `${copy.reshape} (R)`, !canEditPolygon)}
  </div>;
}
