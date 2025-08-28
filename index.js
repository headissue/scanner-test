// Barcode detection functionality
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let barcodeDetector;
let animationId;

// Initialize camera and barcode detection on page load
window.addEventListener('load', async function () {
  try {
    // Check if BarcodeDetector is supported
    if ('BarcodeDetector' in window) {
      barcodeDetector = new BarcodeDetector();
      console.log('BarcodeDetector initialized');
    } else {
      alert('BarcodeDetector API not supported in this browser')
      return;
    }

    // Get camera access
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Prefer back camera
        width: {ideal: 640},
        height: {ideal: 480}
      }
    });

    video.srcObject = stream;

    // Wait for video to load and set canvas dimensions
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.style.width = video.offsetWidth + 'px';
      canvas.style.height = video.offsetHeight + 'px';

      // Start barcode detection
      detectBarcodes();
    });

  } catch (error) {
    console.error('Error accessing camera:', error);
    alert('Camera access denied or not available')
  }
});

async function detectBarcodes() {
  try {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const barcodes = await barcodeDetector.detect(video);

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (barcodes.length > 0) {

        // Draw bounding boxes
        ctx.strokeStyle = '#28a745';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(40, 167, 69, 0.2)';

        barcodes.forEach(barcode => {
          const {cornerPoints} = barcode;

          // Draw bounding box
          ctx.beginPath();
          ctx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
          cornerPoints.forEach(point => {
            ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Draw barcode value text
          ctx.fillStyle = '#28a745';
          ctx.font = '16px Arial';
          ctx.fillText(
              barcode.rawValue,
              cornerPoints[0].x,
              cornerPoints[0].y - 10
          );
        });
      }
    }
  } catch (error) {
    console.error('Barcode detection error:', error);
  }

  // Continue detection loop
  animationId = requestAnimationFrame(detectBarcodes);
}
