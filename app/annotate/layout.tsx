import type { ReactNode } from "react";
import { EditorArchitectureBridge } from "../editor/runtime/editor-architecture-bridge";

export default function AnnotateLayout({ children }: { children: ReactNode }) {
  return <EditorArchitectureBridge>{children}</EditorArchitectureBridge>;
}
