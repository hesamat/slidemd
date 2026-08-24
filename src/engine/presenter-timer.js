/**
 * PresenterTimer
 * Displays elapsed presentation time and wall-clock time in the presenter panel.
 * Extends the BreakManager timer pattern: interval-based, updates every second,
 * and cleans up on destroy. Owned by DeckController.
 *
 * The timer freezes on stop (so the user can see how long they presented)
 * and resets to zero on the next start (new session).
 */
export class PresenterTimer {
  constructor(elements) {
    this.elements = elements;
    this.startTime = null;
    this.elapsed = 0;
  }

  start() {
    this.startTime = Date.now();
    this.elapsed = 0;
    this.tick();
  }

  stop() {
    if (this.startTime) {
      this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.startTime = null;
    }
  }

  tick() {
    const elapsed = this.startTime
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : this.elapsed;
    this.updateDisplay(elapsed, new Date());
  }

  updateDisplay(elapsedSec, now) {
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    const elapsedStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (this.elements.presenterElapsed) {
      this.elements.presenterElapsed.textContent = elapsedStr;
    }
    if (this.elements.presenterClock) {
      this.elements.presenterClock.textContent = clockStr;
    }
  }

  destroy() {
    this.stop();
    this.elements = null;
  }
}
