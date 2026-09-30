/**
 * Getting a chosen photo ready to upload.
 *
 * A phone photo is several megabytes, and a profile picture is never shown
 * much more than a hundred pixels across. So the photo is cropped to a centred
 * square and redrawn small here, before anything is sent: the upload takes a
 * moment rather than a minute on mobile data, and what gets stored is a few
 * dozen kilobytes rather than the original.
 *
 * Redrawing it also leaves behind everything a camera writes into the file
 * besides the picture, including where the photo was taken. On a site used by
 * fifteen-year-olds that matters more than the bandwidth.
 */

/** Pixels along each side: the largest avatar on the site, on a high-density screen. */
const PHOTO_SIZE = 320;

/** Beyond this a file is not worth decoding in the browser at all. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export type PhotoProblem = "not-image" | "too-large" | "unreadable";

export class PhotoError extends Error {
  readonly problem: PhotoProblem;

  constructor(problem: PhotoProblem) {
    super(problem);
    this.name = "PhotoError";
    this.problem = problem;
  }
}

/**
 * Loads a picture, or rejects if the browser cannot read it.
 *
 * By the load event rather than `image.decode()`: Chrome holds a decode back
 * until the page is next drawn, so choosing a photo and then switching tabs,
 * or a phone locking its screen, left it waiting indefinitely.
 */
function loadImage(address: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new PhotoError("unreadable"));
    image.src = address;
  });
}

export async function preparePhoto(file: File): Promise<Blob> {
  // Some systems give a photo no type at all (a HEIC file on Windows, say), so
  // only a type that is plainly something else is turned away here. Whether
  // it can be decoded is the real test.
  if (file.type.length > 0 && !file.type.startsWith("image/")) throw new PhotoError("not-image");
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError("too-large");

  const address = URL.createObjectURL(file);

  try {
    const image = await loadImage(address);

    // The browser has already turned the photo the right way up by the
    // orientation the camera recorded, so these are the dimensions as seen.
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side === 0) throw new PhotoError("unreadable");

    // A small photo is not blown up: that only makes it blurrier and bigger.
    const target = Math.min(PHOTO_SIZE, side);

    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("unreadable");

    // JPEG has no transparency, so a see-through PNG is laid on white rather
    // than turning black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target, target);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      target,
      target
    );

    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!photo) throw new PhotoError("unreadable");

    return photo;
  } finally {
    URL.revokeObjectURL(address);
  }
}
