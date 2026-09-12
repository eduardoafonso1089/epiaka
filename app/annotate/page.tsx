import { CanonicalEditorWorkbench } from "../editor/workbench/canonical-editor-workbench";
import styles from "./annotate-interface.module.css";
import drawer from "./annotate-drawer-state.module.css";

export default function AnnotatePage() {
  return <div className={`${styles.routeRoot} ${drawer.routeRoot}`}><CanonicalEditorWorkbench /></div>;
}
