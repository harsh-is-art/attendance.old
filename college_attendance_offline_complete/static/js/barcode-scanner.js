/* QR + 1-D barcode scanner. Native BarcodeDetector handles QR + many 1-D formats; Quagga handles common 1-D ID-card barcodes. */
class NativeBarcodeScanner {
  constructor(container, onScan) {
    this.container = container;
    this.onScan = onScan;
    this.running = false;
    this.mode = null;
    this.recentCodes = new Map();
    this.stream = null;
    this.video = null;
    this.detector = null;
    this.quaggaDetected = null;
  }

  async start() {
    if (this.running) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      throw Error("Camera access (`getUserMedia`) requires a Secure Context (HTTPS or localhost). Browsers block HTTP camera access on LAN IPs like " + window.location.hostname + ".");
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Error("Camera access (`getUserMedia`) is not supported or blocked over insecure HTTP.");
    }
    if ("BarcodeDetector" in window) {
      try {
        this.running = true;
        await this.startNative();
        this.mode = "native";
        this.nativeLoop();
        return;
      } catch (e) {
        console.warn("Native scanner unavailable, attempting Quagga fallback:", e);
        this.cleanupNative();
      }
    }
    this.running = true;
    await this.startQuagga();
    this.mode = "quagga";
  }

  async startNative() {
    const wanted = ["code_128", "qr_code", "code_39"];
    let formats = wanted;
    if (BarcodeDetector.getSupportedFormats) {
      let supported = await BarcodeDetector.getSupportedFormats();
      formats = wanted.filter(x => supported.includes(x));
      
      const oneDFormats = ["code_128", "code_39"];
      const hasOneD = formats.some(f => oneDFormats.includes(f));
      if (!hasOneD) {
        throw Error("No supported 1D barcode format in native BarcodeDetector.");
      }
    }
    this.detector = new BarcodeDetector({ formats });
    this.container.innerHTML = "";
    this.mode = "native";
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.style.cssText = "width:100%;max-height:420px;object-fit:cover;display:block;background:#000";
    this.container.appendChild(this.video);
    this.addGuide();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  async nativeLoop() {
    while (this.running && this.mode === "native" && this.video) {
      try {
        let codes = await this.detector.detect(this.video);
        for (let item of codes) {
          if (!item.rawValue) continue;
          if (item.format && !["code_128", "qr_code", "code_39"].includes(item.format)) {
            continue;
          }
          this.emit(item.rawValue);
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 120));
    }
  }

  inGuide(box) {
    return true;
  }

  startQuagga() {
    if (typeof Quagga === "undefined") throw Error("Barcode scanner library (Quagga) is not loaded.");
    return new Promise((resolve, reject) => {
      this.container.innerHTML = "";
      this.addGuide();
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: this.container,
          constraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        },
        locator: { patchSize: "medium", halfSample: false },
        numOfWorkers: Math.max(2, Math.min(navigator.hardwareConcurrency || 2, 4)),
        frequency: 10,
        decoder: {
          readers: ["code_128_reader", "code_39_reader"],
          multiple: false
        },
        locate: true
      }, err => {
        if (err) return reject(Error("Camera/barcode scanner could not start: " + err.message));
        this.quaggaDetected = data => {
          if (!data || !data.codeResult) return;
          const result = data.codeResult;
          const code = result.code ? String(result.code).trim() : "";
          if (!code) return;

          // Reject any format that is not code_128 or code_39
          const format = result.format || "";
          if (format && !format.startsWith("code_128") && !format.startsWith("code_39")) {
            return;
          }

          // Reject high error noisy reads
          const decodedCodes = result.decodedCodes || [];
          const errors = decodedCodes.filter(c => c.error !== undefined).map(c => c.error);
          if (errors.length > 0) {
            const avgError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
            if (avgError > 0.15) {
              return;
            }
          }

          // 2-frame verification to eliminate noise and random digit flashes
          const now = Date.now();
          if (!this.scanBuffer) this.scanBuffer = { code: "", count: 0, time: 0 };
          
          if (this.scanBuffer.code === code && (now - this.scanBuffer.time) < 400) {
            this.scanBuffer.count++;
            if (this.scanBuffer.count >= 2) {
              this.scanBuffer = { code: "", count: 0, time: 0 };
              this.emit(code);
            }
          } else {
            this.scanBuffer = { code: code, count: 1, time: now };
          }
        };
        Quagga.onDetected(this.quaggaDetected);
        Quagga.start();
        resolve();
      });
    });
  }

  inGuideQuagga(data) {
    return true;
  }

  addGuide() {
    if (this.container.querySelector(".scan-guide")) return;
    const g = document.createElement("div");
    g.className = "scan-guide";
    g.innerHTML = "<span>Place QR / barcode here</span>";
    this.container.appendChild(g);
  }

  emit(value) {
    let code = String(value || "").replace(/[\r\n\t]/g, "").trim().toUpperCase();
    if (!code) return;

    // If it's a URL (from a QR code), extract the terminal path
    if (code.includes("://") || code.includes("/")) {
      const parts = code.split("/").filter(Boolean);
      const last = parts[parts.length - 1].split("?")[0].trim();
      if (last) code = last.toUpperCase();
    }

    let now = Date.now();
    if ((this.recentCodes.get(code) || 0) > now - 2500) return;
    this.recentCodes.set(code, now);
    for (let [k, t] of this.recentCodes) { if (now - t > 10000) this.recentCodes.delete(k); }
    this.onScan(code);
  }

  cleanupNative() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
    this.torchOn = false;
  }

  getVideoTrack() {
    if (this.stream) {
      const tracks = this.stream.getVideoTracks();
      if (tracks.length > 0) return tracks[0];
    }
    if (typeof Quagga !== "undefined" && Quagga.CameraAccess) {
      const track = Quagga.CameraAccess.getActiveTrack();
      if (track) return track;
    }
    return null;
  }

  async hasTorch() {
    try {
      const track = this.getVideoTrack();
      if (!track) return false;
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      return !!capabilities.torch;
    } catch (e) {
      return false;
    }
  }

  async toggleTorch() {
    const track = this.getVideoTrack();
    if (!track) throw Error("No active camera video track found.");
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
      throw Error("Flashlight/Torch is not supported by your device camera.");
    }
    this.torchOn = !this.torchOn;
    await track.applyConstraints({
      advanced: [{ torch: this.torchOn }]
    });
    return this.torchOn;
  }

  triggerHighlight(isSuccess) {
    const guide = this.container.querySelector(".scan-guide");
    if (!guide) return;
    guide.classList.remove("scan-success", "scan-error");
    // Force reflow for re-triggering animation
    void guide.offsetWidth;
    guide.classList.add(isSuccess ? "scan-success" : "scan-error");
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      guide.classList.remove("scan-success", "scan-error");
    }, 1500);
  }

  stop() {
    this.running = false;
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.cleanupNative();
    if (this.mode === "quagga" && typeof Quagga !== "undefined") {
      if (this.quaggaDetected) Quagga.offDetected(this.quaggaDetected);
      Quagga.stop();
    }
    this.container.innerHTML = "";
    this.mode = null;
  }
}

window.NativeBarcodeScanner = NativeBarcodeScanner;

