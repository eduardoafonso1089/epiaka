export type Tool =
  | "select"
  | "pan"
  | "box"
  | "polygon"
  | "freehand"
  | "line"
  | "point"
  | "ring"
  | "sam"
  | "split"
  | "transform"
  | "reshape";

export type Label = {
  id: string;
  name: string;
  color: string;
  key: string;
};

/**
 * Reference from a COG crop to the file it came from. Kept in the asset because it is what
 * maps the annotation — drawn in the editor's 1000 × 650 space — back to a pixel of the
 * original file and to a ground coordinate.
 */
export type GeoRef = {
  /** Nome ou URL do COG de origem. */
  source: string;
  /** EPSG code of the file, or "sem CRS". */
  crs: string;
  /** Canto superior esquerdo do arquivo, na unidade do CRS. */
  originX: number;
  originY: number;
  /** CRS units per pixel of the file. */
  scaleX: number;
  scaleY: number;
  sourceWidth: number;
  sourceHeight: number;
  /** The cropped window, in pixels of the source file, with y growing downwards. */
  window: { x: number; y: number; w: number; h: number };
  /** Size of the generated PNG. It can be smaller than the window: the crop is capped. */
  cropWidth: number;
  cropHeight: number;
};

export type Asset = {
  id: string;
  name: string;
  src: string;
  local?: boolean;
  missing?: boolean;
  byteSize?: number;
  width?: number;
  height?: number;
  geo?: GeoRef;
};

export type Annotation = {
  id: string;
  asset: string;
  label: string;
  // "line" is an open polyline: it uses `pts` like the polygon, but without closing the outline.
  type: "box" | "polygon" | "line" | "point";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Clockwise rotation in radians around the centre of a bounding box. */
  rotation?: number;
  pts?: number[];
  /** Interior rings (holes) of a polygon. Legacy annotations simply omit this field. */
  holes?: number[][];
};

export type SamPrompt = {
  x: number;
  y: number;
  label: 0 | 1;
};
