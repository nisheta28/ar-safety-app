function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

const FORWARD_DEADZONE = 0.05;
const MAX_YAW_DEG = 52;
const PROXIMITY_HANDOFF = 0.92;
const FADE_START = 0.55;
/** SVG rotation pivot (viewBox coords) — base of arrow */
const PIVOT_X = 50;
const PIVOT_Y = 66;

function detectionToYawDeg(det) {
  const nx = det.nx;
  if (Math.abs(nx) < FORWARD_DEADZONE) {
    return 0;
  }
  const sign = nx > 0 ? 1 : -1;
  const t = clamp01((Math.abs(nx) - FORWARD_DEADZONE) / (1 - FORWARD_DEADZONE));
  return sign * MAX_YAW_DEG * t;
}

export function createARGuidance(options = {}) {
  const container = options.container ?? document.body;

  const hudRoot = document.createElement("div");
  hudRoot.className = "guidance-arrow-hud";
  hudRoot.setAttribute("aria-hidden", "true");
  hudRoot.innerHTML = `
    <svg class="guidance-arrow-svg" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg">
      <g class="guidance-arrow-rotate">
        <line class="guidance-arrow-stem" x1="50" y1="66" x2="50" y2="26" />
        <line class="guidance-arrow-wing" x1="50" y1="26" x2="22" y2="54" />
        <line class="guidance-arrow-wing" x1="50" y1="26" x2="78" y2="54" />
      </g>
    </svg>
  `;
  hudRoot.style.opacity = "0";
  container.appendChild(hudRoot);

  const rotateG = hudRoot.querySelector(".guidance-arrow-rotate");

  const label = document.createElement("div");
  label.className = "guidance-label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = "";
  container.appendChild(label);

  const bboxEl = document.createElement("div");
  bboxEl.className = "exit-bbox";
  bboxEl.style.display = "none";
  container.appendChild(bboxEl);

  let running = false;
  let yawSmooth = 0;
  let yawVel = 0;
  let arrowOpacity = 0;
  let handoffCooldown = 0;

  function smoothYawTowardDeg(target, dt) {
    let diff = target - yawSmooth;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    const spring = 14;
    const damping = 10;
    yawVel += diff * spring * dt;
    yawVel *= Math.exp(-damping * dt);
    yawSmooth += yawVel * dt;
  }

  function setBbox(det) {
    if (!det || !det.showBbox || !det.bbox) {
      bboxEl.style.display = "none";
      return;
    }
    const { x, y, w, h } = det.bbox;
    bboxEl.style.display = "block";
    bboxEl.style.left = `${x * 100}%`;
    bboxEl.style.top = `${y * 100}%`;
    bboxEl.style.width = `${w * 100}%`;
    bboxEl.style.height = `${h * 100}%`;
  }

  function updateLabel(det, proximity) {
    if (!running || arrowOpacity < 0.08) {
      label.textContent = "";
      return;
    }
    const forward = det && Math.abs(det.nx) < FORWARD_DEADZONE + 0.06;
    if (proximity > FADE_START) {
      label.textContent = "Almost there";
    } else if (forward) {
      label.textContent = "Exit ahead";
    } else {
      label.textContent = "This way";
    }
  }

  function tick(detectorOutput, dt, onHandoff) {
    if (!running) return;

    handoffCooldown = Math.max(0, handoffCooldown - dt);

    if (!detectorOutput) {
      arrowOpacity = arrowOpacity + (0 - arrowOpacity) * (1 - Math.exp(-5 * dt));
      hudRoot.style.opacity = String(arrowOpacity);
      bboxEl.style.display = "none";
      label.textContent = "";
      return;
    }

    setBbox(detectorOutput);

    const targetYaw = detectionToYawDeg(detectorOutput);
    smoothYawTowardDeg(targetYaw, dt);
    rotateG.setAttribute("transform", `rotate(${yawSmooth} ${PIVOT_X} ${PIVOT_Y})`);

    const proximity = detectorOutput.proximity ?? 0;

    let targetOp = 0.96;
    if (proximity > FADE_START) {
      targetOp = targetOp + (0.08 - targetOp) * ((proximity - FADE_START) / (1 - FADE_START));
    }

    arrowOpacity = arrowOpacity + (targetOp - arrowOpacity) * (1 - Math.exp(-8 * dt));
    hudRoot.style.opacity = String(arrowOpacity);

    if (proximity > 0.88) {
      bboxEl.classList.add("exit-bbox--pulse");
    } else {
      bboxEl.classList.remove("exit-bbox--pulse");
    }

    updateLabel(detectorOutput, proximity);

    if (proximity >= PROXIMITY_HANDOFF && handoffCooldown <= 0) {
      handoffCooldown = 1.1;
      onHandoff?.();
    }
  }

  return {
    start() {
      running = true;
      arrowOpacity = 0;
      yawSmooth = 0;
      yawVel = 0;
      handoffCooldown = 0.4;
    },
    stop() {
      running = false;
      hudRoot.style.opacity = "0";
      label.textContent = "";
      bboxEl.style.display = "none";
      bboxEl.classList.remove("exit-bbox--pulse");
    },
    tick,
    dispose() {
      running = false;
      hudRoot.remove();
      label.remove();
      bboxEl.remove();
    }
  };
}
