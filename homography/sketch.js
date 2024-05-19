/*
SETUP:
Best used in dark room & bright projector.
1. Place webcam so that it can see the entire projected image without cropping/obstruction.
2. Press 1,2,q,w to set input homography points. (See top-left debug panel)
3. Cast a shadow. Change quantizeThreshold until the shadow is properly captured (See top-middle debug panel)
4. Change ballColour until the top-right debug panel (which is just ballColour grey) is no longer captured (See top-middle debug panel)
5. Press c to toggle calibration mode

Most other parameters are just visual, and can be modified to taste.
*/

// colour palettes that the balls explode into
let palettes = 
[
  ['05A8AA', '047476', 'F9AF10', 'D52941', '990D35'], // vibrant https://coolors.co/05a8aa-047476-f9af10-d52941-990d35
  ['334E58', '6DB1BF', 'FFEAEC', 'F39A9D', 'FC6471'], // blue & red https://coolors.co/334e58-6db1bf-ffeaec-f39a9d-fc6471
  ['F9DBBD', 'FFA5AB', 'DA627D', 'A53860', '6C0E32'], // reddish https://coolors.co/f9dbbd-ffa5ab-da627d-a53860-450920
  ['2B3A64', '007991', '439A86', 'BCD8C1', 'E9D985'], // blue & yellow https://coolors.co/2b3a64-007991-439a86-bcd8c1-e9d985
  ['B8D8BA', 'D9DBBC', 'FCDDBC', 'EF959D', '69585F'], // pastel https://coolors.co/b8d8ba-d9dbbc-fcddbc-ef959d-69585f
]

// video
let captureWidth; // size of video capture. must have same aspect ratio as canvas size in order to prevent squishing.
let captureHeight;
var video; // the actual video capture

// Matrices to hold video data in OpenCV format
let videoMat; // raw video input
let processedVideoMat; // rectilinar, quanitized video input
let rbCanvas; // output in presentation mode
let paintCanvas; // output in presentation mode
let prevFrameOutputCanvas; // outputCanvas of the previous frame before output perspective distortion

// homography points  [X, Y, X, Y, X, Y, X, Y]
let identityHomographyPoints = [0, 0, captureWidth, 0, 0, captureHeight, captureWidth, captureHeight];
let inputHomographyPoints = [0, 0, captureWidth, 0, 0, captureHeight, captureWidth, captureHeight];
let outputHomographyPoints = [0, 0, captureWidth, 0, 0, captureHeight, captureWidth, captureHeight]; // unused

// State machine for the current calibration mode. Turns out I only needed 2 so this could've just been a boolean.
const CalibrationMode = {
	IOHomography: 0,
	Present: 1,

  Sentinel: 2,
}
let currentCalibrationMode = CalibrationMode.IOHomography;

// list of rigidbodies. Performance intensive so should only be max like 10 at a timee.
let rigidBodies = [];

let openCvReady = false;

let params = {
  // show the input in presnetation mode, for debugging
  showInputInPresentationMode: false, 

  // quantizing the input for shadow detection
  quantize: true,
  quantizeThreshold: 5,
  quantizeThresholdMin: 0.0,
  quantizeThresholdMax: 255,
  quantizeThresholdStep: 1,

  // The ball is a grey instead of pure black, to distinguish from IRL shadows.
  ballColour: 60,
  ballColourMin: 0,
  ballColourMax: 255,

  // How long to wait until colour pallete swap?
  colorPaletteTime: 60,
  colorPaletteTimeMin: 0,
  colorPaletteTimeMax: 180,

  // blurring to reduce noise in shadow detection
  ksize: 1,
  ksizeMin: 1,
  ksizeMax: 40,

  // ball gravity
  gravity: 0.1,
  gravityMin: 0,
  gravityMax: 2,
  gravityStep: 0.01,

  // maximum # of bounces before ball pops (unused)
  maxBounces: 5,
  maxBouncesMin: 0,
  maxBouncesMax: 10,

  // max lifespan of balls, in seconds.
  lifespan: 20,
  lifespanMin: 1,
  lifespanMax: 60,

  // How long it takes for the ball to shrink, when it times out
  shrinkTime: 160,
  shrinkTimeMin: 0,
  shrinkTimeMax: 1000,

  // ball's bounce damping coefficient vs shadows
  bounciness: 0.3,
  bouncinessMin: 0,
  bouncinessMax: 1,
  bouncinessStep: 0.01,

  // ball's bounce damping coefficient vs the ground
  bouncinessGround: 0.7,
  bouncinessGroundMin: 0,
  bouncinessGroundMax: 1,
  bouncinessGroundStep: 0.01,

  // how much the ball squash-stretches in the direction of travel, based on velocity
  squishiness: 0.085,
  squishinessMin: 0,
  squishinessMax: 0.3,
  squishinessStep: 0.005,

  // ball wobble parameters
  wobbleAmp: 0.05,
  wobbleAmpMin: 0,
  wobbleAmpMax: 0.4,
  wobbleAmpStep: 0.001,

  wobbleFreq: 0.615,
  wobbleFreqMin: 0,
  wobbleFreqMax: 1,
  wobbleFreqStep: 0.001,

  // Speed at which paint fades out to white.
  paintDisappearSpeed: 0,
  paintDisappearSpeedMin: 0,
  paintDisappearSpeedMax: 10,

  // How likely it is for the ball to leave paint as it travels
  paintStreakChance: 0.4,
  paintStreakChanceMin: 0.0,
  paintStreakChanceMax: 1.0,
  paintStreakChanceStep: 0.01,

  // Minimum velocity needed for the ball to leave paint as it travels
  paintStreakVelThreshold: 1.0,
  paintStreakVelThresholdMin: 0.0,
  paintStreakVelThresholdMax: 3.0,
  paintStreakVelThresholdStep: 0.1,

  // Size of splatter when the ball collides with shadow or ground
  bouncePaintSplatterRadius: 5,
  bouncePaintSplatterRadiusMin: 0,
  bouncePaintSplatterRadiusMax: 100,

  // How many circles to draw when the ball collides with shadow or ground.
  // NOTE: this is density, not the raw count. The actual # of circles is also
  // influenced by the splatter radius
  bouncePaintSplatterDensity: 0.5,
  bouncePaintSplatterDensityMin: 0,
  bouncePaintSplatterDensityMax: 2,
  bouncePaintSplatterDensityStep: 0.1,

  // Size of splatter when the ball pops due to excessive force
  poppedPaintSplatterRadius: 144,
  poppedPaintSplatterRadiusMin: 0,
  poppedPaintSplatterRadiusMax: 200,

  // How many circles to draw when the ball pops due to excessive force.
  // NOTE: this is density, not the raw count. The actual # of circles is also
  // influenced by the splatter radius
  poppedPaintSplatterDensity: 0.7,
  poppedPaintSplatterDensityMin: 0,
  poppedPaintSplatterDensityMax: 2,
  poppedPaintSplatterDensityStep: 0.1,
}

function setup() 
{
  // size of video capture. must have same aspect ratio as canvas size in order to prevent squishing.
  captureWidth = windowWidth / 4;
  captureHeight = windowHeight / 4;

  identityHomographyPoints = [0, 0, captureWidth, 0, 0, captureHeight, captureWidth, captureHeight];
  inputHomographyPoints = identityHomographyPoints.slice();
  outputHomographyPoints = identityHomographyPoints.slice();

  createCanvas(windowWidth, windowHeight);
  createParamGui(params, paramChanged);

  video = createCapture(VIDEO);
  video.size(captureWidth, captureHeight);
  video.hide();

  paintCanvas = createGraphics(captureWidth, captureHeight);
  rbCanvas = createGraphics(captureWidth, captureHeight);
  prevFrameOutputCanvas = createGraphics(captureWidth, captureHeight);

  text("WAITING FOR OPENCV", width /2 - 100, height /2)
}

function onOpenCVComplete() {
  console.log("OpenCV is ready!");

  videoMat = allocateMat(captureWidth, captureHeight);
  processedVideoMat = allocateMat(captureWidth, captureHeight);

  openCvReady = true;
}

function draw()
{
  if (!openCvReady)
  {
    if (frameCount > 100)
    {
      // Hope it's ready
      onOpenCVComplete();
    }
    return;
  }

  // Process input ---------------------------------------------------------------------------
  let videoImg = video.get();
  // Convert the current video frame to a matrix and store it in videoMat
  imageToMat(videoImg, videoMat);
  processInput();

  // debugging stuff  -----------------------------------------------------------------------
  // cache the previous frame's output image
  // prevFrameOutputCanvas.background(255);
  prevFrameOutputCanvas.image(rbCanvas, 0, 0, captureWidth, captureHeight);

  rbCanvas.background(255);
  rbCanvas.clear();
  if (params.showInputInPresentationMode)
  {
    rbCanvas.image(matToNewImage(processedVideoMat), 0, 0, captureWidth, captureHeight);
  }

  // rigidbody stuff  -----------------------------------------------------------------------
  updateRigidBodies();
  drawRigidBodies();
  rigidBodies = rigidBodies.filter(rb => !rb.isDead());
  let paintCanvasBackgroundColor = color('#' + palettes[0][0]);
  paintCanvasBackgroundColor.setAlpha(params.paintDisappearSpeed)
  // paintCanvas.background(color('#' + palettes[0][0]).setAlpha(params.paintDisappearSpeed));
  paintCanvas.background(255,255,255, params.paintDisappearSpeed);
  
  // draw output ----------------------------------------------------------------------------
  drawOutput();
}

function spawnRigidBody()
{
  const seconds = millis() / 1000;
  const index = (int)(seconds / params.colorPaletteTime) % palettes.length
  print(index);
  let rb = new RigidBody(palettes[index]);
  rigidBodies.push(rb);
}

function updateRigidBodies()
{
  let desiredRbCount = map(sin(frameCount*0.005), -1, 1, 0, 2);
  // print(desiredRbCount);
  if (rigidBodies.length < desiredRbCount)
  {
    spawnRigidBody();
  }

  let processedVideoImage = matToNewImage(processedVideoMat)
  for (rb of rigidBodies) {
    rb.update(processedVideoImage);
  }
}

function drawRigidBodies()
{
  let processedVideoImage = matToNewImage(processedVideoMat)
  for (rb of rigidBodies) {
    rb.draw(rbCanvas, paintCanvas, processedVideoImage);
  }
}

function processInput()
{
  // APPLY HOMOGRAPHY TO INPUT ---------------------------------------------------------------------------
  // docs https://docs.opencv.org/4.x/dd/d52/tutorial_js_geometric_transformations.html
  let dst = new cv.Mat(); //temporary matrix to use in post processing greyscalify step
  // let dsize = new cv.Size(videoMat.rows, videoMat.cols);
  let dsize = new cv.Size(captureWidth, captureHeight);

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, inputHomographyPoints);
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, identityHomographyPoints);
  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  // You can try more different parameters
  cv.warpPerspective(videoMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  M.delete(); srcTri.delete(); dstTri.delete();

  // POST PROCESS ----------------------------------------------------------------------------------------
  // Convert dst to greyscale and store it in processedVideoMat
  cv.cvtColor(dst, processedVideoMat, cv.COLOR_RGBA2GRAY);
  dst.delete();

  // Apply a blur to processedVideoMat to reduce noise
  if (params.ksize > 1) {
    cv.blur(processedVideoMat, processedVideoMat, new cv.Size(params.ksize, params.ksize));
  }

  // Apply a threshold filter
  if (params.quantize)
  {
    cv.threshold(processedVideoMat, processedVideoMat, params.quantizeThreshold, 255, cv.THRESH_BINARY);
  }
}

function drawOutput()
{
  background(255);
  // DRAW ----------------------------------------------------------------------------------------
  if (currentCalibrationMode == CalibrationMode.IOHomography)
  {
    background(100)
    // print original
    image(video, 0, 0, captureWidth, captureHeight);
    text("camera input",10,20)

    // print processed
    let processedVideoImage = matToNewImage(processedVideoMat);
    image(processedVideoImage, captureWidth, 0, captureWidth, captureHeight);
    text("processed video",  captureWidth + 10, 20)

    // print processed
    push();
    fill(params.ballColour);
    rect(captureWidth*2, 0, captureWidth, captureHeight);
    text("ball colour",  captureWidth + 10, 20)
    pop();

    // print prevFrameOutputCanvas
    push();
    fill(255);
    rect(0, captureHeight, captureWidth, captureHeight);
    image(prevFrameOutputCanvas, 0, captureHeight, captureWidth, captureHeight);
    text("previous frame output",0 + 10, captureHeight + 20)
    pop();

    // print outputCanvas
    push();
    fill(255);
    rect(captureWidth, captureHeight, captureWidth, captureHeight);
    image(prevFrameOutputCanvas, captureWidth, captureHeight, captureWidth, captureHeight);
    text("current frame output",captureWidth + 10, captureHeight + 20)
    pop();

    // print difference
    image(prevFrameOutputCanvas, captureWidth*2 , captureHeight, captureWidth, captureHeight);
    push();
    blendMode(DIFFERENCE);
    image(rbCanvas, captureWidth*2 , captureHeight, captureWidth, captureHeight);
    pop();
    text("difference ", captureWidth*2 + 10, captureHeight + 20)

    // draw homography points
    push();
    noStroke();
    fill(255,0,0);
    circle(inputHomographyPoints[0], inputHomographyPoints[1], 10);
    fill(0,255,0);
    circle(inputHomographyPoints[2], inputHomographyPoints[3], 10);
    fill(0,0,255);
    circle(inputHomographyPoints[4], inputHomographyPoints[5], 10);
    fill(0,255,255);
    circle(inputHomographyPoints[6], inputHomographyPoints[7], 10);
    pop();

    push();
    noFill();
    stroke(255,0,0);
    beginShape();
    vertex(inputHomographyPoints[0], inputHomographyPoints[1]);
    vertex(inputHomographyPoints[2], inputHomographyPoints[3]);
    vertex(inputHomographyPoints[6], inputHomographyPoints[7]);
    vertex(inputHomographyPoints[4], inputHomographyPoints[5]);
    endShape(CLOSE);
    pop();
  }
  else
  {
    //  APPLY HOMOGRAPHY TO OUTPUT ----------------------------------------------------------------------------
    // let dst = new cv.Mat();
    // // let dsize = new cv.Size(videoMat.rows, videoMat.cols);
    // let dsize = new cv.Size(captureWidth, captureHeight);

    // let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, identityHomographyPoints);
    // let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, outputHomographyPoints);
    // let M = cv.getPerspectiveTransform(srcTri, dstTri);

    // cv.warpPerspective(cv.imread(outputCanvas.elt), dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    // // cv.imshow(outputCanvas.elt, dst);

    // let outputImg = matToNewImage(dst);

    // image(outputImg, 0, 0, width, height);

    // M.delete(); srcTri.delete(); dstTri.delete(); dst.delete();


    // Just raw output ----------------------------------------------------------------------------
    push();
    image(paintCanvas, 0, 0, width, height);
    image(rbCanvas, 0, 0, width, height);
    pop();
  }
}

function keyPressed() {
  // Manually spawn balls ----------------------------------------------------------------------------
  if (key == ' ')
  {
    spawnRigidBody();
  }

  // INPUT HOMOGRAPHY POINTS ----------------------------------------------------------------------------
  if (key == '1')
  {
    inputHomographyPoints[0] = mouseX;
    inputHomographyPoints[1] = mouseY;
  }
  else if (key == '2')
  {
    inputHomographyPoints[2] = mouseX;
    inputHomographyPoints[3] = mouseY;
  }
  else if (key == 'q')
  {
    inputHomographyPoints[4] = mouseX;
    inputHomographyPoints[5] = mouseY;
  }
  else if (key == 'w')
  {
    inputHomographyPoints[6] = mouseX;
    inputHomographyPoints[7] = mouseY;
  }

  // OUTPUT HOMOGRAPHY POINTS (unused) ----------------------------------------------------------------------------
  if (key == '9')
  {
    outputHomographyPoints[0] = mouseX;
    outputHomographyPoints[1] = mouseY;
  }
  else if (key == '0')
  {
    outputHomographyPoints[2] = mouseX;
    outputHomographyPoints[3] = mouseY;
  }
  else if (key == 'o')
  {
    outputHomographyPoints[4] = mouseX;
    outputHomographyPoints[5] = mouseY;
  }
  else if (key == 'p')
  {
    outputHomographyPoints[6] = mouseX;
    outputHomographyPoints[7] = mouseY;
  }

  // CHANGE CALIBRATION MODE  ----------------------------------------------------------------------------
  if (key == 'c')
  {
    currentCalibrationMode += 1;
    if (currentCalibrationMode == CalibrationMode.Sentinel)
    {
      currentCalibrationMode = 0;
    }
    
    if (currentCalibrationMode == CalibrationMode.Present)
    {
      noCursor();
    }
    else if (currentCalibrationMode == CalibrationMode.IOHomography)
    {
      cursor();
    }
  }
}

// global callback from the settings GUI
function paramChanged(name) {
  if (name == "fillScreen") {
    setup()
  }
}