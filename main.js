import { createExitDetector } from "./exit-detection.js";
import { createARGuidance } from "./ar-guidance.js";

const CALL_ENDPOINT = "/call";
const STATUS_ENDPOINT = (sid) => `/api/call-status/${sid}`;
const HANGUP_ENDPOINT = (sid) => `/api/call/${sid}/hangup`;

let exitDetector = null;
let arGuidance = null;
let rafId = null;
let lastFrameTime = performance.now();
let navigationActive = false;
let safetyModeActive = false;
let activationInProgress = false;
let currentCallSid = null;

window.__SAFETY_DEBUG__ = {
  escalation: false,
  attempts: [],
  lastCallOutcome: null
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVideoSource() {
  return window.gestureDetector?.videoEl ?? null;
}

function ensureSystems() {
  if (!exitDetector) {
    exitDetector = createExitDetector({ mockWhenWeak: true });
  }
  if (!arGuidance) {
    arGuidance = createARGuidance({ container: document.body });
  }
}

function stopNavigationLoop() {
  navigationActive = false;
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  arGuidance?.stop();
  exitDetector?.reset();
}

function navigationFrame(now) {
  if (!navigationActive) {
    return;
  }

  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  const video = getVideoSource();
  const det = video ? exitDetector.analyzeFrame(video) : null;

  arGuidance.tick(det, dt, () => {
    exitDetector.advanceExitTarget();
  });

  rafId = requestAnimationFrame(navigationFrame);
}

function startNavigationLoop() {
  stopNavigationLoop();
  navigationActive = true;
  lastFrameTime = performance.now();
  exitDetector.reset();
  arGuidance.start();
  rafId = requestAnimationFrame(navigationFrame);
}

async function hangupCall(sid) {
  if (!sid) return;
  try {
    await fetch(HANGUP_ENDPOINT(sid), { method: "POST" });
  } catch {
    /* non-fatal */
  }
}

async function postCallAndPoll() {
  const res = await fetch(CALL_ENDPOINT, { method: "POST" });
  let data = null;
  try {
    data = await res.json();
  } catch {
    return { answered: false, sid: null };
  }

  if (!res.ok || !data.success) {
    return { answered: false, sid: data?.sid ?? null };
  }

  const sid = data.sid;
  currentCallSid = sid;

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && safetyModeActive) {
    let statusRes;
    try {
      statusRes = await fetch(STATUS_ENDPOINT(sid));
    } catch {
      await sleep(2000);
      continue;
    }

    if (!statusRes.ok) {
      await sleep(2000);
      continue;
    }

    const j = await statusRes.json();
    if (j.answered) {
      window.__SAFETY_DEBUG__.lastCallOutcome = "answered";
      return { answered: true, sid };
    }

    if (j.terminal && j.terminalNotAnswered) {
      window.__SAFETY_DEBUG__.lastCallOutcome = "unanswered";
      return { answered: false, sid };
    }

    if (j.terminal && !j.answered) {
      window.__SAFETY_DEBUG__.lastCallOutcome = "terminal_no_answer";
      return { answered: false, sid };
    }

    await sleep(2000);
  }

  return { answered: false, sid };
}

async function runCallAttemptsWithEscalation() {
  window.__SAFETY_DEBUG__.attempts = [];
  window.__SAFETY_DEBUG__.escalation = false;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (!safetyModeActive) {
      return;
    }

    const result = await postCallAndPoll();
    if (!safetyModeActive) {
      return;
    }

    window.__SAFETY_DEBUG__.attempts.push({
      attempt,
      answered: result.answered,
      sid: result.sid
    });
    console.info("[safety] call attempt", { attempt, answered: result.answered, sid: result.sid });

    if (result.answered) {
      return;
    }

    if (result.sid) {
      await hangupCall(result.sid);
    }

    if (attempt < 3) {
      await sleep(400);
    }
  }

  if (!safetyModeActive) {
    return;
  }

  window.__SAFETY_DEBUG__.escalation = true;
  console.info("[safety] escalation: call unanswered after 3 attempts");

  window.AppUI.showToast("Call unanswered. Sharing your location...", 4500);
  setTimeout(() => {
    if (!safetyModeActive) {
      return;
    }
    window.AppUI.showToast("Location shared with emergency contacts", 4200);
  }, 4600);
}

function endSafetyMode() {
  safetyModeActive = false;
  activationInProgress = false;

  stopNavigationLoop();
  window.AppUI.hideEndSafetyButton();
  window.AppUI.clearToasts();

  document.body.classList.remove("safety-mode");
  document.body.classList.remove("guidance-active");

  if (currentCallSid) {
    const sid = currentCallSid;
    currentCallSid = null;
    void hangupCall(sid);
  }
}

async function handleGestureDetected() {
  if (activationInProgress || safetyModeActive) {
    return;
  }

  activationInProgress = true;
  ensureSystems();

  try {
    await window.AppUI.runCountdown();
  } catch (e) {
    activationInProgress = false;
    if (e && e.code === window.AppUI.COUNTDOWN_CANCEL_CODE) {
      return;
    }
    console.error(e);
    return;
  }

  safetyModeActive = true;
  document.body.classList.add("safety-mode");
  document.body.classList.add("guidance-active");

  window.AppUI.showEndSafetyButton(() => {
    endSafetyMode();
  });

  startNavigationLoop();

  window.AppUI.showToast("Call in progress", 4200);
  setTimeout(() => {
    if (safetyModeActive) {
      window.AppUI.showToast("Finding nearest exit", 4000);
    }
  }, 380);

  void runCallAttemptsWithEscalation();

  activationInProgress = false;
}

document.addEventListener("gestureDetected", handleGestureDetected);

window.addEventListener("beforeunload", () => {
  endSafetyMode();
  arGuidance?.dispose();
});
