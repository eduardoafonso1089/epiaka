import { CanonicalEditorWorkbench } from "../editor/workbench/canonical-editor-workbench";
import styles from "./annotate-interface.module.css";
import drawer from "./annotate-drawer-state.module.css";
import icons from "./premerge-tool-icons.module.css";
import headerIcons from "./premerge-header-icons.module.css";
import headerLayout from "./premerge-header-layout.module.css";
import brand from "./premerge-brand.module.css";
import finalPolish from "./premerge-final-polish.module.css";

export default function AnnotatePage() {
  return <div className={`${styles.routeRoot} ${drawer.routeRoot} ${icons.iconContract} ${headerIcons.headerIcons} ${headerLayout.headerLayout} ${brand.brandContract} ${finalPolish.finalPolish}`}><CanonicalEditorWorkbench /></div>;
}
