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

async function findAvailableCameras() {
  Log.info('Enumerating devices...');
  const devices = await navigator.mediaDevices.enumerateDevices();
  availableCameras = devices.filter(device => device.kind === 'videoinput');
  Log.info('Found ' + availableCameras.length + ' cameras');

  // Show switch button if multiple cameras exist
  if (availableCameras.length > 1) {
    switchButton.removeAttribute('hidden');
    switchButton.addEventListener('click', switchCamera);
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

// Initialize scanner on page load
window.addEventListener('load', async function () {
  try {
    await findAvailableCameras();

    // Start the scanner
    startScanner();
  } catch (error) {
    Log.error('Error initializing scanner:', error);
  }
});

// Start the Quagga scanner
async function startScanner() {
  if (isScanning) return;

  try {
    closeExistingStreams();

    // Get the preferred camera (usually the rear camera)
    let deviceId = null;
    if (availableCameras.length > 0) {
      if (!currentCamera) {
        currentCamera = availableCameras[availableCameras.length - 1];
      }
      deviceId = currentCamera.deviceId;  // Use deviceId property of the camera object
    }

    updateButtonText();
    // Configure Quagga
    const config = {
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: document.querySelector("#interactive"),
        constraints: {
          deviceId: deviceId ? {exact: deviceId} : undefined,
          facingMode: "environment"
        }
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
      locate: true

    };

    // Initialize Quagga
    Quagga.init(config, function (err) {
      if (err) {
        Log.error('Error initializing Quagga:', err);
        return;
      }

      // Store the video stream
      const video = document.querySelector('#interactive video');
      if (video && video.srcObject) {
        currentStream = video.srcObject;
      }

      // Start Quagga
      Quagga.start();
      isScanning = true;

      Log.info('Quagga scanner started');
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
    
    Log.info({
      currentCamera: currentCamera.label,
      availableCameras: availableCameras
          .map(camera => camera.label)
    });
    
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
