
// Helper functions adapted from: https://github.com/orgicus/p5.js-cv

/**
 * Allocate a new matrix to store image data.
 */
function allocateMat(width, height) {
  let sourceMat = new cv.Mat(height, width, cv.CV_8UC4);
  return sourceMat;
}

/**
 * Convert an OpenCV Mat into a p5.Image.
 */
function matToNewImage(sourceMat) {
  let destinationImage = createImage(sourceMat.cols, sourceMat.rows);
  cv.imshow(destinationImage.canvas, sourceMat);
  return destinationImage;
}

/**
 * Convert a p5.Image into an OpenCV Mat.
 */
function imageToMat(sourceImage, cvMat) {
  let sourceWidth = sourceImage.width;
  let sourceHeight = sourceImage.height;
  let data = sourceImage
    .drawingContext
    .getImageData(0, 0, sourceWidth, sourceHeight).data;
  cvMat.data.set(data);
}
