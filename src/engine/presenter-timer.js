/**
 * PresenterTimer
 * Displays elapsed presentation time and wall-clock time in the presenter panel.
 * Extends the BreakManager timer pattern: interval-based, updates every second,
 * and cleans up on destroy. Owned by DeckController.
 *
 * The timer resets to zero when stopped — each presentation session is
 * independent. This avoids fragile offset accumulation across pause/resume.
 */
export class PresenterTimer {
  constructor(elements) {
    this.elements = elements;
    this.startTime = null;
  }

  start() {
    if (this.startTime) return;
    this.startTime = Date.now();
    this.tick();
  }

  stop() {
    this.startTime = null;
    this.updateDisplay(0, new Date());
  }

  tick() {
    const elapsed = this.startTime
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : 0;
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
