"use client";

import { useCallback, useMemo, useReducer } from "react";
import type { EditorAnnotation } from "../models/annotation-model";
import type { SelectionState } from "../selection/selection-model";
import { createEditorState, editorReducer, type SelectedVertex } from "./editor-state";

export function useEditorState(initialAnnotations: EditorAnnotation[] = []) {
  const [state, dispatch] = useReducer(editorReducer, initialAnnotations, createEditorState);

  const selectedAnnotation = useMemo(
    () => state.annotations.find((annotation) => annotation.id === state.selection.selected) ?? null,
    [state.annotations, state.selection.selected],
  );

  const selectedAnnotations = useMemo(() => {
    const ids = new Set(state.selection.multiSelected);
    return state.annotations.filter((annotation) => ids.has(annotation.id));
  }, [state.annotations, state.selection.multiSelected]);

  const replaceAnnotations = useCallback((annotations: EditorAnnotation[], markSaved = true) => {
    dispatch({ type: "replace-annotations", annotations, markSaved });
  }, []);

  const addAnnotation = useCallback((annotation: EditorAnnotation, select = true) => {
    dispatch({ type: "add-annotation", annotation, select });
  }, []);

  const deleteAnnotations = useCallback((ids: string[]) => {
    dispatch({ type: "delete-annotations", ids });
  }, []);

  const setSelection = useCallback((selection: SelectionState) => {
    dispatch({ type: "set-selection", selection });
  }, []);

  const selectVertex = useCallback((vertex: SelectedVertex) => {
    dispatch({ type: "select-vertex", vertex });
  }, []);

  return {
    state,
    dispatch,
    annotations: state.annotations,
    history: state.history,
    redo: state.redo,
    selection: state.selection,
    selectedVertex: state.selectedVertex,
    selectedAnnotation,
    selectedAnnotations,
    saved: state.saved,
    replaceAnnotations,
    addAnnotation,
    deleteAnnotations,
    setSelection,
    selectVertex,
  };
}
