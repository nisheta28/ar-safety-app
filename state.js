(() => {
  /**
   * Directional primitives only (system-driven, no user input):
   * - forward: move straight in the current heading
   * - left/right: turn in place
   */
  const classroomExitPath = [
    { direction: "forward", durationMs: 2200, transitionMs: 250, note: "Move from desk area toward classroom aisle." },
    { direction: "right", durationMs: 700, transitionMs: 250, note: "Align with classroom door approach." },
    { direction: "forward", durationMs: 1300, transitionMs: 300, note: "Reach classroom door threshold." }
  ];

  // Default phase-2 route: hallway -> east exit.
  const eastExitPath = [
    { direction: "right", durationMs: 700, transitionMs: 250, note: "Turn east in the north-south hallway." },
    { direction: "forward", durationMs: 2800, transitionMs: 300, note: "Follow clear corridor to east exit." }
  ];

  // Alternate phase-2 route: hallway -> north then west -> elevators/exit.
  const westExitPath = [
    { direction: "forward", durationMs: 1700, transitionMs: 250, note: "Continue north along hallway." },
    { direction: "left", durationMs: 700, transitionMs: 250, note: "Turn west toward elevators/alternate exit." },
    { direction: "forward", durationMs: 2600, transitionMs: 300, note: "Proceed west to elevator/exit zone." }
  ];

  /**
   * Simple system state flow:
   * classroom -> hallway -> exit
   */
  const FLOW_STATES = {
    CLASSROOM: "classroom",
    HALLWAY: "hallway",
    EXIT: "exit"
  };

  /**
   * Chooses phase-2 path without user input.
   * blockedEast can be toggled by system conditions (e.g., simulated hazard).
   */
  function chooseHallwayPath(options = {}) {
    const { blockedEast = false } = options;
    return blockedEast ? westExitPath : eastExitPath;
  }

  class NavigationController {
    constructor(options = {}) {
      this.state = FLOW_STATES.CLASSROOM;
      this.blockedEast = Boolean(options.blockedEast);
      this.stepQueue = [];
      this.currentStepIndex = -1;
      this.isRunning = false;
      this.timerId = null;
      this.onStep = typeof options.onStep === "function" ? options.onStep : () => {};
      this.onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
      this.onComplete = typeof options.onComplete === "function" ? options.onComplete : () => {};
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.state = FLOW_STATES.CLASSROOM;
      this.onStateChange(this.state);

      // Phase 1: classroom -> door.
      const phase1 = classroomExitPath.map((step) => ({ ...step, phase: "phase1" }));

      // Phase 2: hallway -> exit (default east unless blocked).
      const selectedHallwayPath = chooseHallwayPath({ blockedEast: this.blockedEast })
        .map((step) => ({ ...step, phase: "phase2" }));

      this.stepQueue = [...phase1, ...selectedHallwayPath];
      this.currentStepIndex = -1;
      this.runNextStep();
    }

    stop() {
      this.isRunning = false;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
    }

    runNextStep() {
      if (!this.isRunning) return;
      this.currentStepIndex += 1;

      if (this.currentStepIndex >= this.stepQueue.length) {
        this.state = FLOW_STATES.EXIT;
        this.onStateChange(this.state);
        this.onComplete({ state: this.state });
        this.stop();
        return;
      }

      // Transition from classroom to hallway once phase 1 ends.
      if (this.currentStepIndex === classroomExitPath.length) {
        this.state = FLOW_STATES.HALLWAY;
        this.onStateChange(this.state);
      }

      const step = this.stepQueue[this.currentStepIndex];
      this.onStep({
        index: this.currentStepIndex,
        total: this.stepQueue.length,
        state: this.state,
        step
      });

      const stepDuration = Math.max(200, step.durationMs || 0);
      const transitionDuration = Math.max(0, step.transitionMs || 0);
      const totalDuration = stepDuration + transitionDuration;

      // Smooth transition by reserving a short blend interval between steps.
      this.timerId = setTimeout(() => this.runNextStep(), totalDuration);
    }
  }

  window.NavigationState = {
    FLOW_STATES,
    classroomExitPath,
    eastExitPath,
    westExitPath,
    chooseHallwayPath,
    NavigationController
  };
})();

