import { CanonicalEditorWorkbench } from "../editor/workbench/canonical-editor-workbench";
import styles from "./exact-pre-refactor-refinements.module.css";
import final from "./exact-pre-refactor-final.module.css";

export default function AnnotatePage() {
  return <div className={`${styles.contract} ${final.contract}`}><CanonicalEditorWorkbench /></div>;
}
