// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PresenterTimer } from "../engine/presenter-timer.js";

describe("PresenterTimer", () => {
  let elements;

  beforeEach(() => {
    elements = {
      presenterElapsed: document.createElement("span"),
      presenterClock: document.createElement("span"),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays 00:00 elapsed before start", () => {
    const timer = new PresenterTimer(elements);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("00:00");
  });

  it("counts elapsed seconds after start", () => {
    const timer = new PresenterTimer(elements);
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    timer.start();
    // Advance 65 seconds
    vi.spyOn(Date, "now").mockReturnValue(now + 65000);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("01:05");
  });

  it("preserves elapsed offset after stop and resume", () => {
    const timer = new PresenterTimer(elements);
    const t0 = 2000000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    timer.start();
    vi.spyOn(Date, "now").mockReturnValue(t0 + 30000);
    timer.stop();
    expect(timer.elapsedOffset).toBe(30);
    expect(timer.startTime).toBeNull();
    // Resume 10 seconds later
    vi.spyOn(Date, "now").mockReturnValue(t0 + 40000);
    timer.start();
    vi.spyOn(Date, "now").mockReturnValue(t0 + 45000);
    timer.tick();
    // 30 (offset) + 5 (new) = 35
    expect(elements.presenterElapsed.textContent).toBe("00:35");
  });

  it("updates wall-clock time display", () => {
    const timer = new PresenterTimer(elements);
    timer.tick();
    // toLocaleTimeString output varies by locale, just verify it's non-empty
    expect(elements.presenterClock.textContent.length).toBeGreaterThan(0);
  });

  it("does not double-start", () => {
    const timer = new PresenterTimer(elements);
    const t0 = 3000000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    timer.start();
    const firstStart = timer.startTime;
    timer.start();
    expect(timer.startTime).toBe(firstStart);
  });

  it("stop is a no-op when not running", () => {
    const timer = new PresenterTimer(elements);
    timer.stop();
    expect(timer.startTime).toBeNull();
    expect(timer.elapsedOffset).toBe(0);
  });

  it("destroy nulls elements and stops", () => {
    const timer = new PresenterTimer(elements);
    const t0 = 4000000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    timer.start();
    timer.destroy();
    expect(timer.elements).toBeNull();
    expect(timer.startTime).toBeNull();
  });

  it("handles missing DOM elements gracefully", () => {
    const timer = new PresenterTimer({});
    expect(() => timer.tick()).not.toThrow();
    expect(() => timer.start()).not.toThrow();
    expect(() => timer.stop()).not.toThrow();
  });
});
