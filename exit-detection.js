/**
 * Lightweight EXIT-style sign detection from camera frames.
 * Uses saturated red / warm-red clustering; falls back to mock motion when weak signal.
 */

const RED_R_MIN = 140;
const RED_G_MAX = 110;
const RED_B_MAX = 110;
const RED_DOMINANCE = 18;
const MIN_RED_RATIO = 0.004;
const MAX_RED_RATIO = 0.45;
/** Red cluster must be compact (sign-like) to show overlay box */
const MAX_BBOX_SPAN_W = 0.52;
const MAX_BBOX_SPAN_H = 0.48;
const MAX_BBOX_AREA = 0.2;

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function smoothDamp(current, target, velocityRef, smoothTime, dt) {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocityRef.value + omega * change) * dt;
  velocityRef.value = (velocityRef.value - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export function createExitDetector(options = {}) {
  const sampleW = options.sampleWidth ?? 128;
  const sampleH = options.sampleHeight ?? 96;
  const mockWhenWeak = options.mockWhenWeak !== false;

  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let mockPhase = 0;
  let mockExitIndex = 0;
  const mockVel = { value: 0 };
  let mockCenterX = 0;

  const smoothNx = { value: 0 };
  const smoothNy = { value: 0.35 };
  const smoothArea = { value: 0 };
  const velNx = { value: 0 };
  const velNy = { value: 0 };
  const velArea = { value: 0 };

  function analyzeFrame(imageSource) {
    if (!imageSource || imageSource.videoWidth === 0) {
      return null;
    }

    ctx.drawImage(imageSource, 0, 0, sampleW, sampleH);
    const { data, width, height } = ctx.getImageData(0, 0, sampleW, sampleH);

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const isRed =
          r > RED_R_MIN &&
          g < RED_G_MAX &&
          b < RED_B_MAX &&
          r - g > RED_DOMINANCE &&
          r - b > RED_DOMINANCE;

        if (isRed) {
          sumX += x;
          sumY += y;
          count += 1;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const totalPx = width * height;
    const ratio = count / totalPx;

    let mode = "none";
    let nx = 0;
    let ny = 0.35;
    let area = 0;
    let showBbox = false;
    let bbox = null;

    if (ratio >= MIN_RED_RATIO && ratio <= MAX_RED_RATIO && count > 12) {
      mode = "camera";
      nx = (sumX / count / (width - 1)) * 2 - 1;
      ny = (sumY / count / (height - 1)) * 2 - 1;
      area = clamp01(ratio / 0.08);

      const spanW = (maxX - minX + 1) / width;
      const spanH = (maxY - minY + 1) / height;
      const spanArea = spanW * spanH;
      const compact =
        spanW <= MAX_BBOX_SPAN_W &&
        spanH <= MAX_BBOX_SPAN_H &&
        spanArea <= MAX_BBOX_AREA;

      if (compact) {
        showBbox = true;
        bbox = {
          x: minX / width,
          y: minY / height,
          w: (maxX - minX + 1) / width,
          h: (maxY - minY + 1) / height
        };
      }
    } else if (mockWhenWeak) {
      mode = "mock";
      mockPhase += 0.022;
      const wander = Math.sin(mockPhase) * 0.55 + Math.sin(mockPhase * 0.37) * 0.2;
      const targetX = clamp01(0.5 + wander * 0.5);
      mockCenterX = smoothDamp(mockCenterX, targetX * 2 - 1, mockVel, 0.85, 0.033);
      nx = mockCenterX;
      ny = -0.15 + Math.sin(mockPhase * 0.9) * 0.08;
      area = 0.4 + Math.sin(mockPhase * 1.3) * 0.12;
      showBbox = false;
      bbox = null;
    }

    if (mode === "none") {
      return null;
    }

    const dt = 0.032;
    const nxSm = smoothDamp(smoothNx.value, nx, velNx, 0.12, dt);
    const nySm = smoothDamp(smoothNy.value, ny, velNy, 0.12, dt);
    const areaSm = smoothDamp(smoothArea.value, area, velArea, 0.18, dt);
    smoothNx.value = nxSm;
    smoothNy.value = nySm;
    smoothArea.value = areaSm;

    const proximity = clamp01(areaSm * 1.55 + (1 - Math.abs(nxSm)) * 0.42);

    return {
      mode,
      nx: nxSm,
      ny: nySm,
      bbox,
      showBbox,
      area: areaSm,
      proximity,
      exitIndex: mockExitIndex
    };
  }

  function advanceExitTarget() {
    mockExitIndex += 1;
    mockPhase += 1.7;
    mockCenterX = (mockExitIndex % 2 === 0 ? -0.65 : 0.72) + Math.random() * 0.08;
    smoothNx.value *= 0.2;
    smoothArea.value *= 0.15;
  }

  function reset() {
    mockPhase = 0;
    mockExitIndex = 0;
    mockCenterX = 0;
    mockVel.value = 0;
    smoothNx.value = 0;
    smoothNy.value = 0.35;
    smoothArea.value = 0;
    velNx.value = 0;
    velNy.value = 0;
    velArea.value = 0;
  }

  return { analyzeFrame, advanceExitTarget, reset };
}
