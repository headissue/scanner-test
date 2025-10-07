// html5-qrcode implementation with feature parity to list-codes-native
// Note: html5-qrcode library is loaded globally via CDN

// DOM elements
const reader = document.getElementById('reader');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const switchButton = document.querySelector('.js-switch-camera');

// Camera management
let html5Qrcode;
let availableCameras = [];
let currentCameraIndex = 0;

// Barcode list management
const clearListButton = document.querySelector(".js-clear-list");
const copyListButton = document.querySelector(".js-copy-list");
const barcodeListElement = document.querySelector(".js-barcode-list");
let scannedBarcodes = new Set();

// Visual feedback state
let lastDetectedBarcodes = [];
let currentBarcodes = [];

const cameraConfig = { fps: 10};

// Initialize on page load
try {
  // Initialize Html5Qrcode
  html5Qrcode = new window.Html5Qrcode("reader");

  // Get available cameras
  availableCameras = await window.Html5Qrcode.getCameras();

  if (availableCameras.length === 0) {
    throw new Error('No cameras found');
  }

  // Show camera switch button if multiple cameras
  if (availableCameras.length > 1) {
    switchButton.removeAttribute('hidden');
    switchButton.addEventListener('click', switchCamera);
  }

  // Start with rear camera (last in list)
  currentCameraIndex = availableCameras.length - 1;


  await html5Qrcode.start(availableCameras[currentCameraIndex].id, cameraConfig, onScanSuccess, onScanFailure);

  // Set up list management
  clearListButton.addEventListener('click', clearBarcodeList);
  copyListButton.addEventListener('click', copyBarcodeList);

} catch (error) {
  console.error('Error initializing scanner:', error);
  alert('Error initializing scanner: ' + error.message);
}

// Camera switching
async function switchCamera() {
  if (availableCameras.length <= 1) return;

  try {
    // Stop current scanning
    await html5Qrcode.stop();

    // Move to next camera (cycle through)
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[currentCameraIndex];

    console.log('Switching to camera: ' + (nextCamera.label || 'Camera ' + (currentCameraIndex + 1)));

    // Update button text with camera name
    updateButtonText();

    // Start scanning with new camera

    await html5Qrcode.start(nextCamera.id, cameraConfig, onScanSuccess, onScanFailure);

  } catch (error) {
    console.error('Error switching camera:', error);
    alert('Error switching camera: ' + error.message);
  }
}

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

// Scan success callback
function onScanSuccess(decodedText, decodedResult) {
  console.log(`Code matched = ${decodedText}`, decodedResult);

  // Add to scanned barcodes if not already present
  if (!scannedBarcodes.has(decodedText)) {
    scannedBarcodes.add(decodedText);
    addBarcodeToList(decodedText);
  }

  // Process for visual feedback (if position data available)
  if (decodedResult && decodedResult.result) {
    processBarcodeResults([{
      rawValue: decodedText, cornerPoints: decodedResult.result.cornerPoints || []
    }]);
  }
}

// Scan failure callback
function onScanFailure(error) {
  // Handle scan failure, usually better to ignore and keep scanning
  //console.warn(`Code scan error = ${error}`);
}

// Process barcode detection results for visual feedback
function processBarcodeResults(barcodes) {
  // Check if barcodes are the same as last detection
  const currentBarcodeValues = barcodes.map(b => b.rawValue).sort();
  const lastBarcodeValues = lastDetectedBarcodes.map(b => b.rawValue).sort();

  if (sameBarcodesDetected(currentBarcodeValues, lastBarcodeValues)) {
    if (areStableEnough(barcodes, lastDetectedBarcodes)) {
      return;
    }
  }

  // Remember current barcodes for next comparison and for drawing
  lastDetectedBarcodes = barcodes;
  currentBarcodes = barcodes;
}

// Check if same barcodes detected
function sameBarcodesDetected(currentBarcodeValues, lastBarcodeValues) {
  return currentBarcodeValues.length === lastBarcodeValues.length && currentBarcodeValues.every((val, index) => val === lastBarcodeValues[index]);
}

// Check if barcodes are stable enough
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
    if (currentCenter.x < lastMinX || currentCenter.x > lastMaxX || currentCenter.y < lastMinY || currentCenter.y > lastMaxY) {
      allBarcodesStable = false;
      break;
    }
  }
  return allBarcodesStable;
}

// Helper function to calculate center point from corner points
function calculateCenterPoint(cornerPoints) {
  const centerX = cornerPoints.reduce((sum, point) => sum + point.x, 0) / cornerPoints.length;
  const centerY = cornerPoints.reduce((sum, point) => sum + point.y, 0) / cornerPoints.length;
  return {x: centerX, y: centerY};
}


// Update display positions with tweening
// Barcode list management functions
function addBarcodeToList(barcodeValue) {
  const template = document.getElementById('barcodeItemTemplate');
  const clone = template.content.cloneNode(true);

  const barcodeItem = clone.querySelector('.barcode-item');
  const valueElement = clone.querySelector('.js-barcode-value');
  const copyButton = clone.querySelector('.js-copy-btn');
  const deleteButton = clone.querySelector('.js-delete-btn');

  valueElement.textContent = barcodeValue;
  copyButton.addEventListener('click', () => copyBarcode(barcodeValue));
  deleteButton.addEventListener('click', () => deleteBarcode(barcodeValue, barcodeItem));

  barcodeListElement.appendChild(barcodeItem);

  // Show list management buttons
  clearListButton.removeAttribute('hidden');
  copyListButton.removeAttribute('hidden');
}

function deleteBarcode(barcodeValue, barcodeItem) {
  scannedBarcodes.delete(barcodeValue);
  barcodeItem.remove();

  // Hide list management buttons if list is empty
  if (scannedBarcodes.size === 0) {
    clearListButton.setAttribute('hidden', 'hidden');
    copyListButton.setAttribute('hidden', 'hidden');
  }
}

function clearBarcodeList() {
  scannedBarcodes.clear();
  barcodeListElement.innerHTML = '';

  // Hide list management buttons
  clearListButton.setAttribute('hidden', 'hidden');
  copyListButton.setAttribute('hidden', 'hidden');
}

function copyBarcodeList() {
  const barcodes = Array.from(scannedBarcodes).join('\n');
  navigator.clipboard.writeText(barcodes).then(() => {
    // Visual feedback for copy
    copyListButton.textContent = 'Copied!';
    copyListButton.classList.add('copied');
    setTimeout(() => {
      copyListButton.textContent = 'Copy List';
      copyListButton.classList.remove('copied');
    }, 1000);
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}

function copyBarcode(barcodeValue) {
  navigator.clipboard.writeText(barcodeValue).then(() => {
    // Visual feedback for individual copy
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1000);
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
}