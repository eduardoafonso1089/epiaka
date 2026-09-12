import type { Asset } from "../../lib/types";

export type LoadedImageAssets = {
  assets: Asset[];
  objectUrls: string[];
  rejected: File[];
};

function imageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Unsupported or unreadable image"));
    image.src = src;
  });
}

function acceptedImage(file: File) {
  return file.type.startsWith("image/") && !/tiff?/i.test(file.type);
}

export async function loadLocalImageAssets(
  files: File[],
  makeId: (prefix: string) => string,
): Promise<LoadedImageAssets> {
  const assets: Asset[] = [];
  const objectUrls: string[] = [];
  const rejected: File[] = [];

  for (const file of files) {
    if (!acceptedImage(file)) {
      rejected.push(file);
      continue;
    }
    const src = URL.createObjectURL(file);
    try {
      const dimensions = await imageDimensions(src);
      objectUrls.push(src);
      assets.push({
        id: makeId("image"),
        name: file.name,
        src,
        local: true,
        byteSize: file.size,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch {
      URL.revokeObjectURL(src);
      rejected.push(file);
    }
  }

  return { assets, objectUrls, rejected };
}
