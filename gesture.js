(() => {
  const EVENT_NAME = "gestureDetected";
  const DEBOUNCE_MS = 2500;
  const REQUIRED_STABLE_FRAMES = 4;

  class GestureDetector {
    constructor() {
      this.videoEl = null;
      this.hands = null;
      this.camera = null;
      this.lastDispatchAt = 0;
      this.stableFrames = 0;
      this.isRunning = false;
    }

    async init() {
      if (typeof Hands === "undefined" || typeof Camera === "undefined") {
        throw new Error("MediaPipe Hands or Camera utils not loaded.");
      }

      this.videoEl = this.createVideoElement();
      this.hands = this.createHandsInstance();

      const baseCameraConfig = {
        onFrame: async () => {
          await this.hands.send({ image: this.videoEl });
        },
        width: 640,
        height: 480
      };

      // Prefer rear camera for mobile AR; gracefully fall back to front camera.
      this.camera = new Camera(this.videoEl, {
        ...baseCameraConfig,
        facingMode: "environment"
      });

      try {
        await this.camera.start();
      } catch (environmentError) {
        this.camera = new Camera(this.videoEl, {
          ...baseCameraConfig,
          facingMode: "user"
        });
        await this.camera.start();
      }
      this.isRunning = true;
    }

    stop() {
      this.isRunning = false;
      if (this.camera && typeof this.camera.stop === "function") {
        this.camera.stop();
      }
    }

    createVideoElement() {
      const video = document.createElement("video");
      video.id = "gesture-camera-feed";
      video.setAttribute("playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.muted = true;

      // Keep feed visible so users see live camera under AR overlays.
      video.style.pointerEvents = "none";

      document.body.appendChild(video);
      return video;
    }

    createHandsInstance() {
      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      hands.onResults((results) => {
        const landmarks = results.multiHandLandmarks?.[0];
        if (!landmarks) {
          this.stableFrames = 0;
          return;
        }

        if (this.isTargetGesture(landmarks)) {
          this.stableFrames += 1;
        } else {
          this.stableFrames = 0;
        }

        const now = Date.now();
        const debounceActive = now - this.lastDispatchAt < DEBOUNCE_MS;
        const isStable = this.stableFrames >= REQUIRED_STABLE_FRAMES;

        if (isStable && !debounceActive) {
          this.dispatchGestureDetected();
          this.lastDispatchAt = now;
          this.stableFrames = 0;
        }
      });

      return hands;
    }

    isTargetGesture(landmarks) {
      const palmVisible = this.isPalmVisible(landmarks);
      const thumbFolded = this.isThumbFoldedInward(landmarks);
      const fingersClosed = this.areFingersClosedOverThumb(landmarks);
      return palmVisible && thumbFolded && fingersClosed;
    }

    isPalmVisible(landmarks) {
      const wrist = landmarks[0];
      const middleMcp = landmarks[9];
      const palmWidth = this.distance(landmarks[5], landmarks[17]);
      const palmHeight = this.distance(wrist, middleMcp);

      // Simple heuristics: hand facing camera enough and upright enough.
      return wrist.y > middleMcp.y && palmWidth > 0.06 && palmHeight > 0.08;
    }

    isThumbFoldedInward(landmarks) {
      const palmCenter = this.getPalmCenter(landmarks);
      const palmWidth = this.distance(landmarks[5], landmarks[17]);
      const thumbTip = landmarks[4];
      const middleMcp = landmarks[9];

      const nearPalmCenter = this.distance(thumbTip, palmCenter) < palmWidth * 0.85;
      const tuckedTowardCenter = this.distance(thumbTip, middleMcp) < palmWidth * 0.8;
      return nearPalmCenter && tuckedTowardCenter;
    }

    areFingersClosedOverThumb(landmarks) {
      const palmCenter = this.getPalmCenter(landmarks);
      const palmWidth = this.distance(landmarks[5], landmarks[17]);
      const fingerTipIndices = [8, 12, 16, 20];
      const fingerMcpIndices = [5, 9, 13, 17];

      for (let i = 0; i < fingerTipIndices.length; i += 1) {
        const tip = landmarks[fingerTipIndices[i]];
        const mcp = landmarks[fingerMcpIndices[i]];

        const tipNearPalm = this.distance(tip, palmCenter) < palmWidth * 1.05;
        const foldedTowardBase = this.distance(tip, mcp) < palmWidth * 0.85;

        if (!tipNearPalm || !foldedTowardBase) {
          return false;
        }
      }

      return true;
    }

    getPalmCenter(landmarks) {
      const ids = [0, 5, 9, 13, 17];
      let x = 0;
      let y = 0;
      let z = 0;

      ids.forEach((id) => {
        x += landmarks[id].x;
        y += landmarks[id].y;
        z += landmarks[id].z;
      });

      return {
        x: x / ids.length,
        y: y / ids.length,
        z: z / ids.length
      };
    }

    distance(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = (a.z || 0) - (b.z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    dispatchGestureDetected() {
      document.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: {
            timestamp: Date.now(),
            source: "mediapipe-hands"
          }
        })
      );
    }
  }

  async function startGestureDetection() {
    const detector = new GestureDetector();
    await detector.init();
    window.gestureDetector = detector;
  }

  window.addEventListener("DOMContentLoaded", async () => {
    try {
      await startGestureDetection();
    } catch (error) {
      console.error("Failed to initialize gesture detection:", error);
    }
  });
})();

