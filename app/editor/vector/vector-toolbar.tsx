"use client";

import { getCopy } from "../../lib/i18n";
import type { VectorTool } from "../commands/editor-shortcuts";
import ui from "../editor-interface.module.css";

type Copy = ReturnType<typeof getCopy>;

export function VectorToolbar({
  copy,
  snapEnabled,
  vectorTool,
  canSimplify,
  canDuplicate,
  canMerge,
  canEditPolygon,
  onToggleSnap,
  onSimplify,
  onDuplicate,
  onMerge,
  onVectorTool,
}: {
  copy: Copy;
  snapEnabled: boolean;
  vectorTool: VectorTool;
  canSimplify: boolean;
  canDuplicate: boolean;
  canMerge: boolean;
  canEditPolygon: boolean;
  onToggleSnap: () => void;
  onSimplify: () => void;
  onDuplicate: () => void;
  onMerge: () => void;
  onVectorTool: (tool: VectorTool) => void;
}) {
  const toolButton = (id: Exclude<VectorTool, null>, label: string, disabled = false) => <button
    type="button"
    aria-pressed={vectorTool === id}
    disabled={disabled}
    onClick={() => onVectorTool(vectorTool === id ? null : id)}
  >{label}</button>;

  return <div className={ui.vectorBar}>
    <button type="button" aria-pressed={snapEnabled} onClick={onToggleSnap}>{snapEnabled ? copy.snapOn : copy.snapOff}</button>
    <button type="button" disabled={!canSimplify} onClick={onSimplify}>{copy.simplify}</button>
    <button type="button" disabled={!canDuplicate} onClick={onDuplicate}>{copy.duplicate}</button>
    <button type="button" disabled={!canMerge} onClick={onMerge}>{copy.merge}</button>
    {toolButton("hole", "Buraco (O)", !canEditPolygon)}
    {toolButton("split", `${copy.split} (X)`, !canEditPolygon)}
    {toolButton("reshape", `${copy.reshape} (R)`, !canEditPolygon)}
  </div>;
}
