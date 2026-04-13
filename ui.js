(() => {
  const CANCEL_CODE = "COUNTDOWN_CANCELLED";

  class UIManager {
    constructor() {
      this.root = document.getElementById("ui-root");
      this.glassesHud = null;
      this.leftLens = null;
      this.rightLens = null;
      this.guidanceMount = null;
      this.systemCues = null;
      this.container = null;
      this.statusEl = null;
      this.badgeEl = null;
      this.clearTimerId = null;

      this.toastStack = null;
      this.countdownLayer = null;
      this.endButton = null;
      this.countdownTimers = [];
      this.systemCueTimerId = null;
      this.endSafetyHandler = null;

      this.ensureMounted();
    }

    ensureMounted() {
      if (!this.root || this.container) return;

      this.glassesHud = document.createElement("div");
      this.glassesHud.className = "glasses-hud";

      this.leftLens = document.createElement("section");
      this.leftLens.className = "glasses-lens glasses-lens--left";
      this.leftLens.setAttribute("aria-hidden", "true");

      this.guidanceMount = document.createElement("div");
      this.guidanceMount.className = "lens-guidance-mount";

      this.leftLens.appendChild(this.guidanceMount);

      this.rightLens = document.createElement("section");
      this.rightLens.className = "glasses-lens glasses-lens--right";
      this.rightLens.setAttribute("aria-live", "polite");

      const templeHint = document.createElement("div");
      templeHint.className = "glasses-temple-hint";
      templeHint.textContent = "Hold side temple to exit";
      templeHint.setAttribute("aria-hidden", "true");
      this.rightLens.appendChild(templeHint);

      this.container = document.createElement("div");
      this.container.className = "status-panel";

      this.badgeEl = document.createElement("div");
      this.badgeEl.className = "status-badge";
      this.badgeEl.textContent = "";

      this.statusEl = document.createElement("div");
      this.statusEl.className = "status-text";
      this.statusEl.textContent = "";

      this.container.appendChild(this.badgeEl);
      this.container.appendChild(this.statusEl);
      this.container.classList.add("status-panel--idle");
      this.rightLens.appendChild(this.container);

      this.systemCues = document.createElement("div");
      this.systemCues.className = "lens-system-cues";
      this.rightLens.appendChild(this.systemCues);

      this.glassesHud.appendChild(this.leftLens);
      this.glassesHud.appendChild(this.rightLens);
      this.root.appendChild(this.glassesHud);

      this.toastStack = document.createElement("div");
      this.toastStack.className = "toast-stack";
      this.toastStack.setAttribute("aria-live", "polite");
      this.root.appendChild(this.toastStack);
    }

    showStatus(text, options = {}) {
      this.ensureMounted();
      if (!this.statusEl) return;

      const { badge = "", durationMs = 0 } = options;

      this.statusEl.textContent = text;
      const badgeText = String(badge || "");
      this.badgeEl.textContent = badgeText.toLowerCase() === "navigation" ? "" : badgeText;
      this.container.classList.remove("status-panel--idle");

      if (this.clearTimerId) {
        clearTimeout(this.clearTimerId);
        this.clearTimerId = null;
      }

      if (durationMs > 0) {
        this.clearTimerId = setTimeout(() => this.clearStatus(), durationMs);
      }
    }

    clearStatus() {
      if (!this.statusEl || !this.badgeEl) return;
      this.statusEl.textContent = "";
      this.badgeEl.textContent = "";
      this.container.classList.add("status-panel--idle");
    }

    showSystemCue(text, durationMs = 3000) {
      if (!this.systemCues) return;
      this.systemCues.innerHTML = `<div class="lens-system-cue"><span class="lens-cue-dot"></span>${text}</div>`;

      if (this.systemCueTimerId) {
        clearTimeout(this.systemCueTimerId);
        this.systemCueTimerId = null;
      }

      if (durationMs > 0) {
        this.systemCueTimerId = setTimeout(() => {
          this.clearSystemCue();
        }, durationMs);
      }
    }

    clearSystemCue() {
      if (!this.systemCues) return;
      this.systemCues.innerHTML = "";
      if (this.systemCueTimerId) {
        clearTimeout(this.systemCueTimerId);
        this.systemCueTimerId = null;
      }
    }

    clearCountdownTimers() {
      this.countdownTimers.forEach((id) => clearTimeout(id));
      this.countdownTimers = [];
    }

    /**
     * 3–2–1 countdown with cancel. Resolves on complete; rejects with CANCEL_CODE on cancel.
     */
    runCountdown() {
      this.ensureMounted();
      return new Promise((resolve, reject) => {
        this.clearCountdownTimers();
        if (this.countdownLayer) {
          this.countdownLayer.remove();
          this.countdownLayer = null;
        }

        const layer = document.createElement("div");
        layer.className = "countdown-layer countdown-layer--lens";
        layer.setAttribute("role", "dialog");
        layer.setAttribute("aria-modal", "true");
        layer.setAttribute("aria-label", "Starting safety mode");

        const card = document.createElement("div");
        card.className = "countdown-card";

        const title = document.createElement("div");
        title.className = "countdown-title";
        title.textContent = "Starting safety mode...";

        const num = document.createElement("div");
        num.className = "countdown-number";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn-cancel";
        cancelBtn.textContent = "Cancel";

        const onCancel = () => {
          this.clearCountdownTimers();
          layer.remove();
          this.countdownLayer = null;
          const err = new Error("Cancelled");
          err.code = CANCEL_CODE;
          reject(err);
        };

        cancelBtn.addEventListener("click", onCancel);

        card.appendChild(title);
        card.appendChild(num);
        card.appendChild(cancelBtn);
        layer.appendChild(card);
        (this.rightLens || this.root).appendChild(layer);
        this.countdownLayer = layer;

        const stepMs = 1000;
        num.textContent = "3";

        this.countdownTimers.push(
          setTimeout(() => {
            num.textContent = "2";
          }, stepMs)
        );
        this.countdownTimers.push(
          setTimeout(() => {
            num.textContent = "1";
          }, stepMs * 2)
        );
        this.countdownTimers.push(
          setTimeout(() => {
            layer.remove();
            this.countdownLayer = null;
            resolve();
          }, stepMs * 3)
        );
      });
    }

    /**
     * Non-blocking toast; fades out automatically.
     * @param {string} text
     * @param {number} durationMs 3000–5000 typical
     */
    showToast(text, durationMs = 4000) {
      this.ensureMounted();
      if (!this.toastStack) return;

      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = text;

      this.toastStack.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.add("toast--visible");
      });

      const hideMs = Math.max(2500, durationMs);
      setTimeout(() => {
        toast.classList.remove("toast--visible");
        toast.classList.add("toast--leaving");
        setTimeout(() => toast.remove(), 420);
      }, hideMs);
    }

    clearToasts() {
      if (!this.toastStack) return;
      this.toastStack.innerHTML = "";
      this.clearSystemCue();
    }

    showEndSafetyButton(onClick) {
      this.ensureMounted();
      this.hideEndSafetyButton();

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-end-safety";
      btn.textContent = "End safety mode";
      btn.setAttribute("aria-label", "End safety mode");

      this.endSafetyHandler = (e) => {
        e.preventDefault();
        onClick?.();
      };
      btn.addEventListener("click", this.endSafetyHandler);

      this.root.appendChild(btn);
      this.endButton = btn;

      requestAnimationFrame(() => btn.classList.add("btn-end-safety--visible"));
    }

    hideEndSafetyButton() {
      if (this.endButton) {
        this.endButton.removeEventListener("click", this.endSafetyHandler);
        this.endButton.remove();
        this.endButton = null;
      }
      this.endSafetyHandler = null;
    }

    getGuidanceMount() {
      this.ensureMounted();
      return this.guidanceMount || this.leftLens || this.root;
    }
  }

  window.AppUI = new UIManager();
  window.AppUI.COUNTDOWN_CANCEL_CODE = CANCEL_CODE;
})();
