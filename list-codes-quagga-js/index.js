// Scanned barcodes tracking
const scannedCodes = new Set();
let cameras = [];
let currentCameraIndex = 0;
let isScanning = false;

// DOM elements
const switchCameraBtn = document.getElementById('switchCamera');
const cameraNameDiv = document.getElementById('cameraName');
const barcodeList = document.getElementById('barcodeList');
const clearListBtn = document.getElementById('clearList');
const copyAllListBtn = document.getElementById('copyAllList');
const barcodeTemplate = document.getElementById('barcode-item-template');

// Initialize camera enumeration
async function enumerateCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        cameras = devices.filter(device => device.kind === 'videoinput');
        
        // Find rear camera as default
        const rearCameraIndex = cameras.findIndex(camera => 
            camera.label.toLowerCase().includes('back') || 
            camera.label.toLowerCase().includes('rear') ||
            camera.label.toLowerCase().includes('environment')
        );
        
        if (rearCameraIndex !== -1) {
            currentCameraIndex = rearCameraIndex;
        }
        
        return cameras;
    } catch (err) {
        console.error('Error enumerating cameras:', err);
        return [];
    }
}

// Show camera name temporarily
function showCameraName(name) {
    cameraNameDiv.textContent = name || 'Camera';
    cameraNameDiv.classList.add('visible');
    setTimeout(() => {
        cameraNameDiv.classList.remove('visible');
    }, 2000);
}

// Initialize Quagga
function initQuagga() {
    const config = {
        inputStream: {
            type: "LiveStream",
            target: document.querySelector('#scanner'),
            constraints: {
                width: { min: 640 },
                height: { min: 480 },
                facingMode: "environment",
                aspectRatio: { min: 1, max: 2 }
            }
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: 2,
        frequency: 10,
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
                "i2of5_reader",
                "2of5_reader",
                "code_93_reader"
            ]
        },
        locate: true
    };

    // Add camera constraint if available
    if (cameras.length > 0 && cameras[currentCameraIndex]) {
        config.inputStream.constraints.deviceId = cameras[currentCameraIndex].deviceId;
    }

    Quagga.init(config, function(err) {
        if (err) {
            console.error('Quagga initialization failed:', err);
            alert('Failed to access camera: ' + err);
            return;
        }
        console.log("Quagga initialization finished. Starting...");
        Quagga.start();
        isScanning = true;
        
        // Show current camera name
        if (cameras[currentCameraIndex]) {
            showCameraName(cameras[currentCameraIndex].label);
        }
    });
}

// Draw overlays on canvas
Quagga.onProcessed(function(result) {
    const drawingCtx = Quagga.canvas.ctx.overlay;
    const drawingCanvas = Quagga.canvas.dom.overlay;

    if (result) {
        // Clear previous drawings
        if (result.boxes) {
            drawingCtx.clearRect(0, 0, 
                parseInt(drawingCanvas.getAttribute("width")), 
                parseInt(drawingCanvas.getAttribute("height"))
            );
            
            // Draw detection boxes in green
            result.boxes.filter(box => box !== result.box).forEach(box => {
                Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { 
                    color: "green", 
                    lineWidth: 2 
                });
            });
        }

        // Draw main bounding box in blue
        if (result.box) {
            Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { 
                color: "#00F", 
                lineWidth: 2 
            });
        }

        // Draw detection line in red and display code
        if (result.codeResult && result.codeResult.code) {
            Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { 
                color: 'red', 
                lineWidth: 3 
            });
            
            // Draw center point indicator (green dot)
            if (result.line && result.line.length >= 2) {
                const centerX = (result.line[0].x + result.line[1].x) / 2;
                const centerY = (result.line[0].y + result.line[1].y) / 2;
                
                drawingCtx.beginPath();
                drawingCtx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
                drawingCtx.fillStyle = "lime";
                drawingCtx.fill();
            }
            
            // Display scanned value with semi-transparent background
            const code = result.codeResult.code;
            const format = result.codeResult.format;
            const textX = result.line[0].x;
            const textY = result.line[0].y - 10;
            
            drawingCtx.font = "bold 16px Arial";
            const text = `${code} (${format})`;
            const textWidth = drawingCtx.measureText(text).width;
            
            // Draw semi-transparent background
            drawingCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
            drawingCtx.fillRect(textX - 5, textY - 20, textWidth + 10, 25);
            
            // Draw text
            drawingCtx.fillStyle = "white";
            drawingCtx.fillText(text, textX, textY);
        }
    }
});

// Handle barcode detection
Quagga.onDetected(function(result) {
    const code = result.codeResult.code;
    const format = result.codeResult.format;
    
    // Add to list if not already present
    if (!scannedCodes.has(code)) {
        scannedCodes.add(code);
        addBarcodeToList(code, format);
        
        // Vibrate if available (mobile)
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    }
});

// Add barcode to list UI
function addBarcodeToList(code, format) {
    const template = barcodeTemplate.content.cloneNode(true);
    const li = template.querySelector('.barcode-item');
    const codeSpan = template.querySelector('.barcode-code');
    const formatSpan = template.querySelector('.barcode-format');
    const copyBtn = template.querySelector('.copy-btn');
    const deleteBtn = template.querySelector('.delete-btn');
    
    li.dataset.code = code;
    codeSpan.textContent = code;
    formatSpan.textContent = `(${format})`;
    
    copyBtn.addEventListener('click', () => copyToClipboard(code));
    deleteBtn.addEventListener('click', () => deleteBarcodeFromList(code, li));
    
    barcodeList.appendChild(template);
    updateListActions();
}

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('Copied to clipboard:', text);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

// Delete barcode from list
function deleteBarcodeFromList(code, listItem) {
    scannedCodes.delete(code);
    listItem.remove();
    updateListActions();
}

// Update list action buttons visibility
function updateListActions() {
    const hasItems = scannedCodes.size > 0;
    clearListBtn.style.display = hasItems ? 'inline-block' : 'none';
    copyAllListBtn.style.display = hasItems ? 'inline-block' : 'none';
}

// Clear all barcodes
clearListBtn.addEventListener('click', () => {
    scannedCodes.clear();
    barcodeList.innerHTML = '';
    updateListActions();
});

// Copy all barcodes
copyAllListBtn.addEventListener('click', () => {
    const allCodes = Array.from(scannedCodes).join('\n');
    copyToClipboard(allCodes);
});

// Switch camera
switchCameraBtn.addEventListener('click', async () => {
    if (cameras.length <= 1) {
        alert('Only one camera available');
        return;
    }
    
    // Stop current scanner
    if (isScanning) {
        Quagga.stop();
        isScanning = false;
    }
    
    // Switch to next camera
    currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
    
    // Restart with new camera
    setTimeout(() => {
        initQuagga();
    }, 100);
});

// Initialize app
(async function init() {
    await enumerateCameras();
    initQuagga();
    updateListActions();
})();