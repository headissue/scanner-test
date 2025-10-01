document.addEventListener('DOMContentLoaded', (event) => {
  const scannedResultElement = document.getElementById('scanned-result');

  function onScanSuccess(decodedText, decodedResult) {
    // Handle the scanned code as you like.
    console.log(`Code matched = ${decodedText}`, decodedResult);

    // Display the result on the page.
    scannedResultElement.textContent = `Scanned Result: ${decodedText}`;

    // Stop scanning after a successful scan.
    html5QrcodeScanner.clear().catch(error => {
      console.error("Failed to clear html5QrcodeScanner.", error);
    });
  }

  function onScanFailure(error) {
    // handle scan failure, usually better to ignore and keep scanning.
    // for example:
    console.warn(`Code scan error = ${error}`);
  }

  let html5QrcodeScanner = new Html5QrcodeScanner(
      "reader", // The id of the element to render the scanner in.
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      /* verbose= */ false
  );

  html5QrcodeScanner.render(onScanSuccess, onScanFailure);
});