import { CanonicalEditorWorkbench } from "../editor/workbench/canonical-editor-workbench";
import styles from "./annotate-interface.module.css";

export default function AnnotatePage() {
  return <div className={styles.routeRoot}><CanonicalEditorWorkbench /></div>;
}
