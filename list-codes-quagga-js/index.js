// Scanned barcodes tracking
const scannedCodes = new Set();
let cameras = [];
let currentCameraIndex = 0;
let isScanning = false;

// Tweening state for smooth animations
const tweenedPositions = new Map(); // Map<code, {x, y, targetX, targetY, format, lastSeen}>
const TWEEN_SPEED = 0.1; // Lower = smoother but slower
const CLEANUP_DELAY = 1000; // ms - remove from overlay if not seen for this long
let animationFrameId = null;

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
        
        // Use last camera as default
        if (cameras.length > 0) {
            currentCameraIndex = cameras.length - 1;
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
            ],
            multiple: true

        },
        locate: true,
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
        
        // Start rendering loop
        startRenderLoop();
        
        // Show current camera name
        if (cameras[currentCameraIndex]) {
            showCameraName(cameras[currentCameraIndex].label);
        }
    });
}

// Update target positions from detection results
Quagga.onProcessed(function(result) {
    if (result) {
        // Handle multiple code results (when multiple: true, result may be array)
        const resultItems = Array.isArray(result) ? result : [result];
        
        resultItems.forEach(function(item) {
            const codeResult = item.codeResult || item;
            const line = item.line;
            if (codeResult && codeResult.code && line && line.length >= 2) {
                const code = codeResult.code;
                const format = codeResult.format;
                
                // Calculate target center position
                const targetCenterX = (line[0].x + line[1].x) / 2;
                const targetCenterY = (line[0].y + line[1].y) / 2;
                
                // Get or create tweened position
                if (!tweenedPositions.has(code)) {
                    tweenedPositions.set(code, {
                        x: targetCenterX,
                        y: targetCenterY,
                        targetX: targetCenterX,
                        targetY: targetCenterY,
                        format: format,
                        lastSeen: Date.now()
                    });
                } else {
                    // Update existing position targets
                    const pos = tweenedPositions.get(code);
                    pos.targetX = targetCenterX;
                    pos.targetY = targetCenterY;
                    pos.format = format;
                    pos.lastSeen = Date.now();
                }
            }
        });
    }
});

// Render loop with requestAnimationFrame
function startRenderLoop() {
    function render() {
        if (!isScanning) return;
        
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;
        
        if (drawingCtx && drawingCanvas) {
            // Clear previous drawings
            drawingCtx.clearRect(0, 0, 
                parseInt(drawingCanvas.getAttribute("width")), 
                parseInt(drawingCanvas.getAttribute("height"))
            );
            
            const now = Date.now();
            const toRemove = [];
            
            // Update and draw all tracked codes
            tweenedPositions.forEach((pos, code) => {
                // Check if barcode is stale (not seen recently)
                if (now - pos.lastSeen > CLEANUP_DELAY) {
                    toRemove.push(code);
                    return;
                }
                // Lerp (linear interpolation) for smooth movement
                pos.x += (pos.targetX - pos.x) * TWEEN_SPEED;
                pos.y += (pos.targetY - pos.y) * TWEEN_SPEED;
                
                // Draw center point indicator (lime dot)
                drawingCtx.beginPath();
                drawingCtx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
                drawingCtx.fillStyle = "lime";
                drawingCtx.fill();
                
                // Display scanned value with semi-transparent background
                const textX = pos.x;
                const textY = pos.y - 15;
                
                drawingCtx.font = "bold 16px Arial";
                const text = `${code} (${pos.format})`;
                const textWidth = drawingCtx.measureText(text).width;
                
                // Draw semi-transparent background
                drawingCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
                drawingCtx.fillRect(textX - textWidth/2 - 5, textY - 20, textWidth + 10, 25);
                
                // Draw text (centered above point)
                drawingCtx.fillStyle = "white";
                drawingCtx.fillText(text, textX - textWidth/2, textY);
            });
            
            // Clean up stale barcodes
            toRemove.forEach(code => tweenedPositions.delete(code));
        }
        
        animationFrameId = requestAnimationFrame(render);
    }
    
    render();
}

function stopRenderLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Handle barcode detection
Quagga.onDetected(function(result) {
    let newCodeDetected = false;
    
    // Handle multiple results (when multiple: true)
    const codeResults = Array.isArray(result) ? result : [result];
    
    codeResults.forEach(function(item) {
        const codeResult = item.codeResult || item;
        if (codeResult && codeResult.code) {
            const code = codeResult.code;
            const format = codeResult.format;
            
            // Add to list if not already present
            if (!scannedCodes.has(code)) {
                scannedCodes.add(code);
                addBarcodeToList(code, format);
                newCodeDetected = true;
            }
        }
    });
    
    // Vibrate if available and new code was detected (mobile)
    if (newCodeDetected && navigator.vibrate) {
        navigator.vibrate(10);
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
    tweenedPositions.delete(code); // Clean up tweened position
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
    tweenedPositions.clear(); // Clear tweened positions
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
        stopRenderLoop();
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