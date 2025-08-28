// Barcode detection functionality
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
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
    let stream = await navigator.mediaDevices.getUserMedia({ video: true });
    console.log('Camera access granted');
    
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
          video: { deviceId: { exact: selectedCamera.deviceId } }
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
    const switchButton = document.getElementById('switchCamera');
    if (availableCameras.length > 1) {
      switchButton.style.display = 'block';
      switchButton.addEventListener('click', switchCamera);
      updateButtonText();
    } else {
      switchButton.style.display = 'none';
    }

  } catch (error) {
    console.error('Error accessing camera:', error);
    console.log('Camera access denied or not available')
  }
});

// Update button text with current camera name
function updateButtonText() {
  const switchButton = document.getElementById('switchCamera');
  if (availableCameras.length > 0) {
    const currentCamera = availableCameras[currentCameraIndex];
    const cameraName = currentCamera.label || `Camera ${currentCameraIndex + 1}`;
    switchButton.textContent = `Switch Camera, current: ${cameraName}`;
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
      video: { deviceId: { exact: nextCamera.deviceId } }
    });
    
    // Update video source
    video.srcObject = currentStream;
    
    // Update button text with new camera name
    updateButtonText();
    
  } catch (error) {
    console.error('Error switching camera:', error);
  }
}

async function startContinuousDetection() {
  await detectBarcodes();
  requestAnimationFrame(startContinuousDetection);
}

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

        barcodes.forEach(barcode => {
          const {cornerPoints} = barcode;

          // Draw bounding box
          ctx.beginPath();
          ctx.moveTo(cornerPoints[0].x, cornerPoints[0].y);
          cornerPoints.forEach(point => {
            ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.stroke();

          // Draw barcode value text
          ctx.fillStyle = '#28a745';
          ctx.font = '24px Arial';
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
}
