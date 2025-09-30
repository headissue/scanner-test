// Web Worker for barcode detection using OffscreenCanvas
let barcodeDetector;
let offscreenCanvas;
let offscreenCtx;

// Initialize BarcodeDetector in worker context
self.addEventListener('message', async (event) => {
  const { type, imageBitmap } = event.data;

  if (type === 'init') {
    try {
      if ('BarcodeDetector' in self) {
        barcodeDetector = new BarcodeDetector();
        
        // Create OffscreenCanvas for frame processing
        offscreenCanvas = new OffscreenCanvas(1920, 1080);
        offscreenCtx = offscreenCanvas.getContext('2d');
        
        self.postMessage({ type: 'init-success' });
      } else {
        self.postMessage({ type: 'init-error', error: 'BarcodeDetector not available in worker' });
      }
    } catch (error) {
      self.postMessage({ type: 'init-error', error: error.message });
    }
  } else if (type === 'detect') {
    if (!barcodeDetector) {
      self.postMessage({ type: 'error', error: 'BarcodeDetector not initialized' });
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
      const timeBeforeDetection = performance.now();

      // Detect barcodes from the canvas
      const barcodes = await barcodeDetector.detect(offscreenCanvas);
      
      const timeAfterDetection = performance.now();
      const deltaTimeMs = timeAfterDetection - timeBeforeDetection;

      // Close the ImageBitmap to free memory
      imageBitmap.close();

      self.postMessage({
        type: 'detect-result',
        barcodes: barcodes,
        deltaTimeMs: deltaTimeMs
      });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
});
