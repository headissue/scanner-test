// Barcode detection functionality
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const switchButton = document.querySelector('.js-switch-camera');
const nextScanButton = document.querySelector('.js-next-scan');

let barcodeDetector;

// Camera switching variables
let availableCameras = [];
let currentCameraIndex = 0;
let currentStream = null;

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

    // Get basic camera access to enable device enumeration
    console.log('Requesting camera access...');
    let stream;

    // Try multiple times with different constraints if needed
    try {
      stream = await navigator.mediaDevices.getUserMedia({video: true});
      console.log('Camera access granted');
    } catch (firstError) {
      console.log('First attempt failed:', firstError.message);

      // Try with more specific constraints
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode: 'environment'}
        });
        console.log('Camera access granted on retry');
      } catch (secondError) {
        console.log('Second attempt failed:', secondError.message);

        // Final attempt with any available camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode: 'user'}
        });
        console.log('Camera access granted with front camera');
      }
    }

    // Now enumerate devices (this works after permission is granted)
    try {
      console.log('Enumerating devices...');
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableCameras = devices.filter(device => device.kind === 'videoinput');
      console.log('Found ' + availableCameras.length + ' cameras');

      if (availableCameras.length > 1) {
        // Stop the initial stream
        stream.getTracks().forEach(track => track.stop());

        // Start with the last camera (usually rear camera)
        currentCameraIndex = availableCameras.length - 1;
        const selectedCamera = availableCameras[currentCameraIndex];
        console.log('Using camera: ' + (selectedCamera.label || 'Unknown camera'));

        stream = await navigator.mediaDevices.getUserMedia({
          video: {deviceId: {exact: selectedCamera.deviceId}}
        });
      }

      currentStream = stream;
      console.log('Camera initialized');
    } catch (deviceError) {
      console.log('Device enumeration failed: ' + deviceError.message);
      currentStream = stream;
    }

    video.srcObject = stream;

    // Wait for video to load and set canvas dimensions
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.style.width = video.offsetWidth + 'px';
      canvas.style.height = video.offsetHeight + 'px';

      startContinuousDetection();
    });

    // Add camera switch button event listener
    if (availableCameras.length > 1) {
      switchButton.removeAttribute('hidden');
      switchButton.addEventListener('click', switchCamera);
      updateButtonText();
    } else {
      switchButton.setAttribute('hidden', 'hidden');
    }

  } catch (error) {
    console.error('Error accessing camera:', error);
    console.log('Camera access denied or not available')
  }
});

// Update button text with current camera name
function updateButtonText() {
  if (availableCameras.length > 0) {
    const currentCamera = availableCameras[currentCameraIndex];
    const cameraName = currentCamera.label || `Camera ${currentCameraIndex + 1}`;
    switchButton.textContent = `${cameraName}`;

    // Revert to icon after 1 second
    setTimeout(() => {
      switchButton.textContent = '📷';
    }, 1000);
  }
}

// Camera switching function
async function switchCamera() {
  if (availableCameras.length <= 1) return;

  try {
    // Stop current stream
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    // Move to next camera (cycle through)
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[currentCameraIndex];

    console.log('Switching to camera: ' + (nextCamera.label || 'Camera ' + (currentCameraIndex + 1)));

    // Get new stream
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {deviceId: {exact: nextCamera.deviceId}}
    });

    // Update video source
    video.srcObject = currentStream;

    // Update button text with new camera name
    updateButtonText();

  } catch (error) {
    console.error('Error switching camera:', error);
  }
}

let isDetecting = true;

async function startContinuousDetection() {
  if (!isDetecting) return;
  
  const barcodeFound = await detectBarcodes();
  if (!barcodeFound && isDetecting) {
    requestAnimationFrame(startContinuousDetection);
  }
}

async function detectBarcodes() {
  if (!barcodeDetector || !video.videoWidth || !video.videoHeight) {
    return false;
  }

  try {
    // FIXME only use horizontal bar heigth 300px. draw tob and bottom border
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Detect barcodes in the current frame
    const barcodes = await barcodeDetector.detect(canvas);
    
    if (barcodes.length > 0) {
      // Stop continuous detection
      isDetecting = false;
      
      const detectionResult = {
        timestamp: new Date().toISOString(),
        barcodes: barcodes.map(barcode => ({
          format: barcode.format,
          rawValue: barcode.rawValue,
          boundingBox: {
            x: barcode.boundingBox.x,
            y: barcode.boundingBox.y,
            width: barcode.boundingBox.width,
            height: barcode.boundingBox.height
          }
        }))
      };
      
      // Fill the pre element with JSON result
      const resultElement = document.querySelector('.js-detection-result');
      resultElement.textContent = JSON.stringify(detectionResult, null, 2);
      
      // Stop the camera
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }
      
      // Remove video and canvas elements
      video.remove();
      canvas.remove();
      
      // Hide camera switch button
      switchButton.remove();
      
      nextScanButton.removeAttribute('hidden');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error detecting barcodes:', error);
    return false;
  }
}

// Cleanup camera stream when page unloads
window.addEventListener('beforeunload', () => {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});