import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { Notification } from "../renderer/notification.js";

describe("Notification", () => {
  beforeEach(() => {
    const { window } = new JSDOM("<!doctype html><html><body></body></html>");
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", window.document);
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      cb();
      return 0;
    });

    Notification.container = null;
    Notification.toastId = 0;
    Notification.modalId = 0;
    Notification.activeToasts = new Map();
    Notification.queuedToasts = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps backward-compatible success API and renders message", () => {
    const toastId = Notification.success("Saved successfully", 0);

    expect(toastId).toBe(1);
    expect(document.querySelectorAll(".notification-toast")).toHaveLength(1);
    expect(document.querySelector(".notification-toast")?.className).toContain(
      "notification-toast--success",
    );
    expect(document.querySelector(".notification-toast__message")?.textContent).toBe(
      "Saved successfully",
    );
  });

  it("limits visible toasts to four and flushes queued toasts on dismiss", () => {
    vi.useFakeTimers();

    for (let i = 1; i <= 5; i += 1) {
      Notification.info(`Toast ${i}`, 0);
    }

    expect(document.querySelectorAll(".notification-toast")).toHaveLength(4);
    expect(Notification.queuedToasts).toHaveLength(1);

    Notification.dismiss(1);
    vi.advanceTimersByTime(350);

    const visibleMessages = [...document.querySelectorAll(".notification-toast__message")].map(
      (el) => el.textContent,
    );
    expect(document.querySelectorAll(".notification-toast")).toHaveLength(4);
    expect(visibleMessages).toContain("Toast 5");
    expect(Notification.queuedToasts).toHaveLength(0);
  });

  it("renders toast action buttons and triggers action callback", () => {
    const onUndo = vi.fn();
    Notification.showToast("Saved", "success", 0, {
      actions: [{ label: "Undo", onClick: onUndo }],
    });

    const actionButton = document.querySelector(".notification-toast__action");
    expect(actionButton?.textContent).toBe("Undo");
    actionButton?.click();

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("supports progress toast updates", () => {
    const toastId = Notification.showProgress("Loading");
    Notification.updateProgress(toastId, 45);

    const progressBar = document.querySelector(".notification-toast__progress-bar");
    expect(progressBar?.style.width).toBe("45%");
  });

  it("provides successWithUndo convenience API", () => {
    const undoFn = vi.fn();

    Notification.successWithUndo("Slide removed", undoFn, 0);
    const actionButton = document.querySelector(".notification-toast__action");
    actionButton?.click();

    expect(undoFn).toHaveBeenCalledTimes(1);
  });
});
