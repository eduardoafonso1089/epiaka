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
  /** Optional 1–5 review score, saved with the project. */
  reviewScore?: number;
};

/** X = a*x + b*y + c; Y = d*x + e*y + f, measured at pixel edges. */
export type RasterTransform = [number, number, number, number, number, number];

export type GeoRef = {
  transform?: RasterTransform;
  /** Nome ou URL do raster de origem. */
  source: string;
  /** EPSG code of the file, or "sem CRS". */
  crs: string;
  originX: number;
  originY: number;
  /** CRS units per source pixel. */
  scaleX: number;
  scaleY: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Window in source-raster pixels. Full tiled rasters use the whole source extent. */
  window: { x: number; y: number; w: number; h: number };
  /** Display asset dimensions. For native tiled rasters these equal source dimensions. */
  cropWidth: number;
  cropHeight: number;
};

export type RasterAsset = {
  kind: "cog";
  mode: "tiled";
  sourceType: "local" | "remote" | "bundled";
  profile?: "complete" | "tiled-no-overviews" | "striped";
  reference?: { transform?: RasterTransform; crs?: string };
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
  raster?: RasterAsset;
  /** Runtime-only local/bundled tiled raster. Never serialized. */
  runtimeRasterSource?: File;
  reviewScore?: number;
};

export type Annotation = {
  id: string;
  asset: string;
  label: string;
  type: "box" | "polygon" | "line" | "point";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Clockwise rotation in radians around the centre of a bounding box. */
  rotation?: number;
  pts?: number[];
  holes?: number[][];
  reviewScore?: number;
};

export type SamPrompt = {
  x: number;
  y: number;
  label: 0 | 1;
};
