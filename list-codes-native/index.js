// Barcode detection functionality
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const switchButton = document.querySelector('.js-switch-camera');
let barcodeDetector;

// Camera switching variables
let availableCameras = [];
let currentCameraIndex = 0;
let currentStream = null;

// Barcode list management
const clearListButton = document.querySelector(".js-clear-list")
const copyListButton = document.querySelector(".js-copy-list")
const barcodeListElement = document.querySelector(".js-barcode-list")
let scannedBarcodes = new Set();


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


    clearListButton.addEventListener('click', clearBarcodeList);
    copyListButton.addEventListener('click', copyBarcodeList);

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

let lastDetectionTime = 0;
let isDetecting = false;
let lastDetectedBarcodes = [];

// Helper function to calculate center point from corner points
function calculateCenterPoint(cornerPoints) {
  const centerX = cornerPoints.reduce((sum, point) => sum + point.x, 0) / cornerPoints.length;
  const centerY = cornerPoints.reduce((sum, point) => sum + point.y, 0) / cornerPoints.length;
  return { x: centerX, y: centerY };
}

async function startContinuousDetection(currentTime) {
  if (currentTime - lastDetectionTime >= 400 && !isDetecting) {
    isDetecting = true;
    detectBarcodes().finally(() => {
      isDetecting = false;
    });
    lastDetectionTime = currentTime;
  }
  requestAnimationFrame(startContinuousDetection);
}

async function detectBarcodes() {
  function areStableEnough(barcodes, previous) {
    // Same barcodes detected, now check if center points are still within bounding boxes
    let allBarcodesStable = true;

    for (const currentBarcode of barcodes) {
      // Find matching barcode from last detection
      const lastBarcode = previous.find(b => b.rawValue === currentBarcode.rawValue);
      if (!lastBarcode) {
        allBarcodesStable = false;
        break;
      }

      // Calculate current center point
      const currentCenter = calculateCenterPoint(currentBarcode.cornerPoints);

      // Calculate last bounding box
      const lastMinX = Math.min(...lastBarcode.cornerPoints.map(p => p.x));
      const lastMaxX = Math.max(...lastBarcode.cornerPoints.map(p => p.x));
      const lastMinY = Math.min(...lastBarcode.cornerPoints.map(p => p.y));
      const lastMaxY = Math.max(...lastBarcode.cornerPoints.map(p => p.y));

      // Check if current center is still within last bounding box
      if (currentCenter.x < lastMinX || currentCenter.x > lastMaxX ||
          currentCenter.y < lastMinY || currentCenter.y > lastMaxY) {
        allBarcodesStable = false;
        break;
      }
    }
    return allBarcodesStable;
  }

  function sameBarcodesDetected(currentBarcodeValues, lastBarcodeValues) {
    return currentBarcodeValues.length === lastBarcodeValues.length &&
        currentBarcodeValues.every((val, index) => val === lastBarcodeValues[index]);
  }

  try {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const barcodes = await barcodeDetector.detect(video);

      // Check if barcodes are the same as last detection
      const currentBarcodeValues = barcodes.map(b => b.rawValue).sort();
      const lastBarcodeValues = lastDetectedBarcodes.map(b => b.rawValue).sort();
      
      if (sameBarcodesDetected(currentBarcodeValues, lastBarcodeValues)) {
        if (areStableEnough(barcodes, lastDetectedBarcodes)) {
          return;
        }
      }

      // Remember current barcodes for next comparison
      lastDetectedBarcodes = barcodes;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (barcodes.length > 0) {

        // Draw center points and text
        ctx.fillStyle = '#28a745';
        ctx.font = '24px Arial';

        barcodes.forEach(barcode => {
          const {cornerPoints} = barcode;

          // Add barcode to list if not already present
          if (!scannedBarcodes.has(barcode.rawValue)) {
            scannedBarcodes.add(barcode.rawValue);
            addBarcodeToList(barcode.rawValue);
          }

          // Calculate center point from corner points
          const center = calculateCenterPoint(cornerPoints);

          // Draw center circle with radius 3
          ctx.beginPath();
          ctx.arc(center.x, center.y, 3, 0, 2 * Math.PI);
          ctx.fill();

          // Measure text width for proper centering
          const textMetrics = ctx.measureText(barcode.rawValue);
          const textWidth = textMetrics.width;
          const textHeight = 24; // Font size
          
          // Draw black background with 70% opacity
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(
              center.x - textWidth / 2 - 5,
              center.y + 30 - textHeight,
              textWidth + 10,
              textHeight + 5
          );
          
          // Draw barcode value text centered below the center point
          ctx.fillStyle = '#28a745';
          ctx.fillText(
              barcode.rawValue,
              center.x - textWidth / 2,
              center.y + 30
          );
        });
      }
    }
  } catch (error) {
    console.error('Barcode detection error:', error);
  }
}

// Barcode list management functions
function addBarcodeToList(barcodeValue) {
  const template = document.querySelector('.js-barcode-item-template');
  const barcodeItem = template.content.cloneNode(true);

  const valueSpan = barcodeItem.querySelector('.js-barcode-value');
  valueSpan.textContent = barcodeValue;

  const copyButton = barcodeItem.querySelector('.js-copy-btn');
  copyButton.onclick = () => copyToClipboard(barcodeValue, copyButton);

  barcodeListElement.appendChild(barcodeItem);

  // Show clear and copy buttons if this is the first barcode
  if (scannedBarcodes.size === 1) {
    clearListButton.removeAttribute('hidden');
    copyListButton.removeAttribute('hidden');
  }
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy: ', err);

  }
}

function clearBarcodeList() {
  scannedBarcodes.clear();
  barcodeListElement.innerHTML = '';
  clearListButton.setAttribute('hidden', 'hidden');
  copyListButton.setAttribute('hidden', 'hidden');
}

async function copyBarcodeList() {
  const barcodeList = Array.from(scannedBarcodes).join('\n');
  await copyToClipboard(barcodeList, copyListButton);
}

// Cleanup camera stream when page unloads
window.addEventListener('beforeunload', () => {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});