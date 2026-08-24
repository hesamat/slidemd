/**
 * PresenterTimer
 * Displays elapsed presentation time and wall-clock time in the presenter panel.
 * Extends the BreakManager timer pattern: interval-based, updates every second,
 * and cleans up on destroy. Owned by DeckController.
 */
export class PresenterTimer {
  constructor(elements) {
    this.elements = elements;
    this.startTime = null;
    this.elapsedOffset = 0;
  }

  start() {
    if (this.startTime) return;
    this.startTime = Date.now();
    this.elapsedOffset = 0;
    this.tick();
  }

  stop() {
    if (!this.startTime) return;
    this.elapsedOffset = Math.floor((Date.now() - this.startTime) / 1000);
    this.startTime = null;
  }

  reset() {
    this.startTime = null;
    this.elapsedOffset = 0;
    this.updateDisplay(0, new Date());
  }

  tick() {
    const elapsed = this.startTime
      ? this.elapsedOffset + Math.floor((Date.now() - this.startTime) / 1000)
      : this.elapsedOffset;
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
