/**
 * Reading a picked file's shape, in the browser.
 *
 * Both semi-automation uploaders — Meta's media picker and Google's five
 * creative slots — refuse a file whose aspect ratio is wrong before any bytes
 * leave the machine. That check is the same in both places and lives here once:
 * a second copy would drift, and the tolerance below is the kind of number that
 * has to agree everywhere or the two pickers reject different files.
 *
 * Browser-only by nature (it decodes through `Image` and `<video>`), so it is
 * imported by client islands and never by a Server Action.
 */

/** Reads an image or video's intrinsic dimensions, or null if it can't. */
export function readDimensions(
  file: File,
  isVideo: boolean,
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight } : null);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(
          img.naturalWidth && img.naturalHeight
            ? { w: img.naturalWidth, h: img.naturalHeight }
            : null,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    }
  });
}

/** Within 3% of the target ratio counts — exports are rarely pixel-perfect. */
export function ratioMatches(
  dim: { w: number; h: number },
  target: { w: number; h: number },
): boolean {
  const got = dim.w / dim.h;
  const want = target.w / target.h;
  return Math.abs(got - want) <= 0.03 * want;
}
