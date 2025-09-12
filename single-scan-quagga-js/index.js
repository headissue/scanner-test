const alertErrors = false;
const alertInfo = false;
const Log = {
  error: function (...args) {
    alertErrors ? alert(JSON.stringify(args)) : console.error(...args);
  },
  info: function (...args) {
    alertInfo ? alert(JSON.stringify(args)) : console.log(...args);
  }
}

// Camera switching variables
let availableCameras = [];
let currentCamera = null;
let currentStream = null;
let isScanning = false;

// DOM elements
const interactive = document.getElementById('interactive');
const switchButton = document.querySelector('.js-switch-camera');
const nextScanButton = document.querySelector('.js-next-scan');
const resultElement = document.querySelector('.js-detection-result');

const scannerConfig = {
  inputStream: {
    name: "Live",
    type: "LiveStream",
    target: document.querySelector("#interactive"),
    constraints: {
      facingMode: { ideal: "environment" }
    },
    area: { // defines rectangle of the detection/localization area
      top: "40%",    // top offset
      right: "0%",  // right offset
      left: "0%",   // left offset
      bottom: "40%"  // bottom offset
    },
  },
  decoder: {
    readers: [
      "code_128_reader",
      "ean_reader",
      "ean_8_reader",
      "code_39_reader",
      "code_39_vin_reader",
      "codabar_reader",
      "upc_reader",
      "upc_e_reader",
      "i2of5_reader"
    ],
    multiple: false
  },
  locate: false
};


async function findAvailableCameras() {
    closeExistingStreams()
    
    Log.info('Enumerating devices...');
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(device => device.kind === 'videoinput');
    
    Log.info('Found cameras:', availableCameras.map(cam => ({
      label: cam.label,
      deviceId: cam.deviceId ? cam.deviceId.substring(0, 20) + '...' : 'empty'
    })));

    // Show switch button if multiple cameras exist
    if (availableCameras.length > 1) {
      switchButton.removeAttribute('hidden');
    } else {
      switchButton.setAttribute('hidden', 'hidden');
    }
}

// Update button text with current camera name
function updateButtonText() {
  if (currentCamera) {
    const cameraName = currentCamera.label;
    switchButton.textContent = `${cameraName}`;

    // Revert to default text after 1 second
    setTimeout(() => {
      switchButton.textContent = '📷';
    }, 1000);
  }
}

// Start the Quagga scanner
async function startScanner() {
  if (isScanning) return;

  try {
    closeExistingStreams();

    // Get the preferred camera (usually the last in the list)
    if (availableCameras.length > 0) {
      if (!currentCamera) {
        currentCamera = availableCameras[availableCameras.length - 1];
      }
      if (!currentCamera.deviceId) {
        Log.error('no deviceId');
        isScanning = false;
        return;
      }
      scannerConfig.inputStream.constraints.deviceId = {exact: currentCamera.deviceId}
    } else {
      Log.error('No cameras found');
      isScanning = false;
      return;
    }

    updateButtonText();

    // Initialize Quagga
    Quagga.init(scannerConfig, function (err) {
      if (err) {
        Log.error('Error initializing Quagga:', err);
        isScanning = false;
        return;
      }

      try {
        // Store the video stream
        const video = document.querySelector('#interactive video');
        if (video && video.srcObject) {
          currentStream = video.srcObject;
        }

        // Start Quagga
        Quagga.start();
        isScanning = true;
      } catch (startError) {
        Log.error('Error starting Quagga:', startError);
        isScanning = false;
      }
    });

    // Set up detection callback for single scan
    Quagga.onDetected(function (result) {
      if (!isScanning) return;

      // Stop scanning after first detection
      stopScanner();

      // Process the result
      Log.info('Detected:', result);

      // Create a simplified result object with only the required attributes
      const simplifiedResult = {
        format: result.codeResult && result.codeResult.format ? result.codeResult.format : 'unknown',
        code: result.codeResult && result.codeResult.code ? result.codeResult.code : '',
      };
      // Fill the pre element with JSON result
      if (resultElement) {
        resultElement.textContent = JSON.stringify(simplifiedResult, null, 2);
      }

      // Clean up elements
      cleanupElements();

      // Show next scan button
      if (nextScanButton) {
        nextScanButton.removeAttribute('hidden');
      }

      // Hide switch camera button
      if (switchButton) {
        switchButton.setAttribute('hidden', 'hidden');
      }
    });

    Quagga.onProcessed(function (result) {
      if (!isScanning) return;

      // Get the drawing context and canvas
      const drawingCtx = Quagga.canvas.ctx.overlay;
      const drawingCanvas = Quagga.canvas.dom.overlay;

      if (drawingCtx && drawingCanvas) {
        // Clear the canvas
        drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));

        // Draw detected boxes if available
        if (result) {
          if (result.boxes) {
            result.boxes.forEach(function (box) {
              Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
            });
          }
        }
      }
    });

  } catch (error) {
    Log.error('Error starting scanner:', error);
  }
}

// Stop the scanner
function stopScanner() {
  try {
    Quagga.stop();
  } catch (e) {
    Log.error("Error stopping Quagga:", e);
  }
  closeExistingStreams()
  isScanning = false;
}

// Clean up elements after scanning
function cleanupElements() {
  // Clear the interactive container
  if (interactive) {
    interactive.innerHTML = '';
  }
}

// Camera switching function
async function switchCamera() {
  if (availableCameras.length <= 1) return;

  try {
    // Stop current scanner
    stopScanner();

    // Switch to next camera
    const currentIndex = availableCameras.indexOf(currentCamera);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    currentCamera = availableCameras[nextIndex];  // Fix: Set to the actual camera object

    // Restart scanner with new camera
    setTimeout(startScanner, 100);
  } catch (error) {
    Log.error('Error switching camera:', error);
  }
}

function closeExistingStreams() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
}

// Cleanup camera stream when page unloads
window.addEventListener('beforeunload', () => {
  closeExistingStreams();
});


// Initialize scanner on page load
async function initializeApp() {
  try {
    Log.info('Requesting camera permissions...');
    currentStream = await navigator.mediaDevices.getUserMedia({video: {}});

    await findAvailableCameras();
    switchButton.addEventListener('click', switchCamera);

    // Start the scanner
    await startScanner();
  } catch (error) {
    Log.error('Error initializing scanner:', error);
  }
}

await initializeApp();
