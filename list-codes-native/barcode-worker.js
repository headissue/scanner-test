// Web Worker for barcode detection using OffscreenCanvas
let barcodeDetector;
let offscreenCanvas;
let offscreenCtx;

function init() {
  try {
    if ('BarcodeDetector' in self) {
      barcodeDetector = new BarcodeDetector({formats: ['ean_13']});

      // Create OffscreenCanvas for frame processing
      offscreenCanvas = new OffscreenCanvas(1, 1);
      offscreenCtx = offscreenCanvas.getContext('2d');

      self.postMessage({type: 'init-success'});
    } else {
      self.postMessage({type: 'init-error', error: 'BarcodeDetector not available in worker'});
    }
  } catch (error) {
    self.postMessage({type: 'init-error', error: error.message});
  }
}

// Create a new OffscreenCanvas containing a downscaled, pixelated copy of the source canvas
// scaleFactor: 0.0 to 1.0, where 1.0 = original size, 0.5 = half size, etc.
function createDownscaledCanvas(sourceCanvas, scaleFactor = 1.0) {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (!srcW || !srcH) return null;

  // Clamp scale factor between 0.01 and 1.0
  const scale = Math.max(0.01, Math.min(1.0, scaleFactor));
  if (scale >= 1.0) return sourceCanvas; // No need to scale

  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const scaled = new OffscreenCanvas(dstW, dstH);
  const sctx = scaled.getContext('2d');
  //sctx.imageSmoothingEnabled = false;
  sctx.clearRect(0, 0, dstW, dstH);
  sctx.drawImage(sourceCanvas, 0, 0, dstW, dstH);
  return scaled;
}

async function detect(imageBitmap) {
  if (!barcodeDetector) {
    self.postMessage({type: 'error', error: 'BarcodeDetector not initialized'});
    return;
  }

  try {

    // Resize canvas if needed
    if (offscreenCanvas.width !== imageBitmap.width ||
        offscreenCanvas.height !== imageBitmap.height) {
      offscreenCanvas.width = imageBitmap.width;
      offscreenCanvas.height = imageBitmap.height;
    }

    // Draw ImageBitmap to OffscreenCanvas in worker thread
    offscreenCtx.drawImage(imageBitmap, 0, 0);

    // Detect barcodes from a horizontal bar in the center
    let barcodes = [];
    const timeBeforeDetection = performance.now();
    
    // Step 1: Apply scale factor
    let scale = .6;
    const scaledCanvas = createDownscaledCanvas(offscreenCanvas, scale);
    
    // Step 2: Extract horizontal bar from center (100px height) of scaled canvas
    let number = 0;
    const barHeight = number || scaledCanvas.height;
    const canvasWidth = scaledCanvas.width;
    const canvasHeight = scaledCanvas.height;
    const barY = Math.max(0, Math.floor((canvasHeight - barHeight) / 2));
    const actualBarHeight = Math.min(barHeight, canvasHeight);
    
    // Create a new canvas for the horizontal bar
    const barCanvas = new OffscreenCanvas(canvasWidth, actualBarHeight);
    const barCtx = barCanvas.getContext('2d');
    
    // Copy the horizontal bar region from the scaled canvas
    barCtx.drawImage(
      scaledCanvas,
      0, barY, canvasWidth, actualBarHeight,  // source region
      0, 0, canvasWidth, actualBarHeight       // destination
    );
    
    barcodes = await barcodeDetector.detect(barCanvas);
    const timeAfterDetection = performance.now();
    const deltaTimeMs = timeAfterDetection - timeBeforeDetection;

    // Map barcodes to only include rawValue and cornerPoints
    // Scale coordinates back to original size and offset Y back to original position
    const scaleFactor = 1.0 / scale;
    const filteredBarcodes = barcodes.map(barcode => ({
      rawValue: barcode.rawValue,
      cornerPoints: barcode.cornerPoints.map(point => ({
        x: point.x * scaleFactor,
        y: (point.y + barY) * scaleFactor  // Offset Y then scale back to original
      }))
    }));

    // Close the ImageBitmap to free memory
    imageBitmap.close();

    self.postMessage({
      type: 'detect-result',
      barcodes: filteredBarcodes,
      deltaTimeMs: deltaTimeMs
    });
  } catch (error) {
    self.postMessage({type: 'error', error: error.message});
  }
}

// Initialize BarcodeDetector in worker context
self.addEventListener('message', async (event) => {
  const { type, imageBitmap } = event.data;

  if (type === 'init') {
    init();
  } else if (type === 'detect') {
    await detect(imageBitmap);
  }
});
