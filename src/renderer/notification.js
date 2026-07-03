/**
 * Notification System
 * Modern toast notification system to replace native alerts
 */

export class Notification {
  static container = null;
  static toastId = 0;
  static modalId = 0;
  static maxVisibleToasts = 4;
  static activeToasts = new Map();
  static queuedToasts = [];

  /**
   * Initialize the notification container
   */
  static init() {
    if (this.container) return;
    if (!document.body) {
      // Wait for DOMContentLoaded if body is not ready
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
      return;
    }
    this.container = document.createElement("div");
    this.container.className = "notification-container";
    this.container.setAttribute("aria-live", "polite");
    this.container.setAttribute("aria-atomic", "true");
    document.body.appendChild(this.container);
  }

  /**
   * Show a notification toast
   * @param {string} message - The message to display
   * @param {string} type - The type of notification: 'success', 'error', 'info', 'warning'
   * @param {number} duration - Duration in milliseconds (0 = no auto-dismiss)
   * @param {Object} options - Optional toast configuration
   * @param {Array<{label: string, onClick: Function}>} options.actions - Action buttons
   * @param {number} options.progress - Progress percentage (0-100)
   * @returns {number} The toast ID
   */
  static showToast(message, type = "info", duration = 3000, options = {}) {
    if (typeof duration === "object" && duration !== null) {
      options = duration;
      duration = 3000;
    }
    this.init();

    const toastId = ++this.toastId;
    const config = { toastId, message, type, duration, options };

    if (this.activeToasts.size >= this.maxVisibleToasts) {
      this.queuedToasts.push(config);
      return toastId;
    }

    this.renderToast(config);
    return toastId;
  }

  static renderToast({ toastId, message, type, duration, options }) {
    const toast = document.createElement("div");
    toast.className = `notification-toast notification-toast--${type}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("data-toast-id", toastId);

    const icon = this.getIcon(type);
    const body = document.createElement("div");
    body.className = "notification-toast__body";

    const messageEl = document.createElement("span");
    messageEl.className = "notification-toast__message";
    messageEl.textContent = message;
    body.appendChild(messageEl);

    const progressValue = Number.isFinite(options?.progress)
      ? Math.min(100, Math.max(0, options.progress))
      : null;
    let progressBar = null;
    if (progressValue !== null) {
      const progressTrack = document.createElement("div");
      progressTrack.className = "notification-toast__progress";
      progressTrack.setAttribute("role", "progressbar");
      progressTrack.setAttribute("aria-valuemin", "0");
      progressTrack.setAttribute("aria-valuemax", "100");
      progressTrack.setAttribute("aria-valuenow", String(progressValue));

      progressBar = document.createElement("div");
      progressBar.className = "notification-toast__progress-bar";
      progressBar.style.width = `${progressValue}%`;

      progressTrack.appendChild(progressBar);
      body.appendChild(progressTrack);
    }

    const actions = Array.isArray(options?.actions) ? options.actions : [];
    if (actions.length > 0) {
      const actionsEl = document.createElement("div");
      actionsEl.className = "notification-toast__actions";
      actions.forEach((action) => {
        const actionBtn = document.createElement("button");
        actionBtn.className = "notification-toast__action";
        actionBtn.textContent = action.label;
        actionBtn.onclick = () => {
          if (typeof action.onClick === "function") {
            action.onClick();
          }
        };
        actionsEl.appendChild(actionBtn);
      });
      body.appendChild(actionsEl);
    }

    toast.appendChild(icon);
    toast.appendChild(body);

    let autoDismissTimeout = null;
    const closeBtn = this.createCloseButton(() => {
      this.dismiss(toastId);
      if (autoDismissTimeout) {
        clearTimeout(autoDismissTimeout);
      }
    });
    toast.appendChild(closeBtn);

    this.container.prepend(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add("notification-toast--show");
    });

    // Auto-dismiss after duration
    if (duration > 0) {
      autoDismissTimeout = setTimeout(() => this.dismiss(toastId), duration);
    }

    this.activeToasts.set(toastId, { toast, autoDismissTimeout, progressBar });
  }

  /**
   * Get icon element for notification type
   * @param {string} type - The notification type
   * @returns {HTMLElement} The icon element
   */
  static getIcon(type) {
    const icon = document.createElement("span");
    icon.className = "notification-toast__icon";
    icon.setAttribute("aria-hidden", "true");

    const iconMap = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };

    icon.innerHTML = iconMap[type] || iconMap.info;
    return icon;
  }

  /**
   * Dismiss a notification toast
   * @param {HTMLElement} toast - The toast element to dismiss
   */
  static dismiss(toastOrId) {
    if (toastOrId === null || toastOrId === undefined) return;

    let toast = toastOrId;
    if (typeof toastOrId === "number") {
      const activeToast = this.activeToasts.get(toastOrId)?.toast;
      if (!activeToast) {
        this.queuedToasts = this.queuedToasts.filter((item) => item.toastId !== toastOrId);
        return;
      }
      toast = activeToast;
    }

    if (!toast || !toast.parentNode || toast.dataset.dismissing === "true") return;
    toast.dataset.dismissing = "true";
    const toastId = Number(toast.getAttribute("data-toast-id"));
    const toastState = this.activeToasts.get(toastId);
    if (toastState?.autoDismissTimeout) {
      clearTimeout(toastState.autoDismissTimeout);
    }

    toast.classList.remove("notification-toast--show");
    toast.classList.add("notification-toast--hide");

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
      this.activeToasts.delete(toastId);
      this.flushQueue();
    }, 300);
  }

  static flushQueue() {
    while (this.activeToasts.size < this.maxVisibleToasts && this.queuedToasts.length > 0) {
      const nextToast = this.queuedToasts.shift();
      this.renderToast(nextToast);
    }
  }

  /**
   * Convenience methods for different notification types
   */
  static success(message, duration = 3000, options = {}) {
    if (typeof duration === "object" && duration !== null) {
      options = duration;
      duration = 3000;
    }
    return this.showToast(message, "success", duration, options);
  }

  static error(message, duration = 5000, options = {}) {
    if (typeof duration === "object" && duration !== null) {
      options = duration;
      duration = 5000;
    }
    return this.showToast(message, "error", duration, options);
  }

  static warning(message, duration = 4000, options = {}) {
    if (typeof duration === "object" && duration !== null) {
      options = duration;
      duration = 4000;
    }
    return this.showToast(message, "warning", duration, options);
  }

  static info(message, duration = 3000, options = {}) {
    if (typeof duration === "object" && duration !== null) {
      options = duration;
      duration = 3000;
    }
    return this.showToast(message, "info", duration, options);
  }

  static showProgress(message, type = "info") {
    return this.showToast(message, type, 0, { progress: 0 });
  }

  static updateProgress(toastId, progressPercent) {
    const clampedValue = Math.min(100, Math.max(0, Number(progressPercent) || 0));
    const toastState = this.activeToasts.get(toastId);
    if (toastState?.progressBar) {
      toastState.progressBar.style.width = `${clampedValue}%`;
      toastState.progressBar.parentElement?.setAttribute("aria-valuenow", String(clampedValue));
      return;
    }

    const queuedToast = this.queuedToasts.find((item) => item.toastId === toastId);
    if (queuedToast) {
      queuedToast.options = { ...(queuedToast.options || {}), progress: clampedValue };
    }
  }

  static successWithUndo(message, undoFn, duration = 5000) {
    return this.showToast(message, "success", duration, {
      actions: [
        {
          label: "Undo",
          onClick: () => {
            if (typeof undoFn === "function") {
              undoFn();
            }
          },
        },
      ],
    });
  }

  static async showBlocking(
    message,
    {
      title = "Action required",
      type = "warning",
      actionLabel = "Continue",
      cancelLabel = "Cancel",
      onAction,
      onCancel,
      focusPrimary = true,
      closeResolvesTo = false,
    } = {},
  ) {
    return this.showModal({
      title,
      message,
      type,
      blockBackdrop: true,
      buttons: [
        {
          label: actionLabel,
          isPrimary: true,
          resolvesTo: true,
          onResolve: onAction,
        },
        {
          label: cancelLabel,
          isPrimary: false,
          resolvesTo: false,
          onResolve: onCancel,
        },
      ],
      focusPrimary,
      closeResolvesTo,
    });
  }

  /**
   * Show a confirmation dialog with promise-based response
   * @param {string} message - The confirmation message
   * @returns {Promise<boolean>} - True if confirmed, false if cancelled
   */
  static async confirm(message) {
    return this.showModal({
      title: "Confirm Action",
      message,
      buttons: [
        { label: "Cancel", isPrimary: false, resolvesTo: false },
        { label: "Confirm", isPrimary: true, resolvesTo: true },
      ],
      focusPrimary: false,
    });
  }

  /**
   * Show a dialog asking user to choose between re-uploading or using cached version
   * @param {string} title - The dialog title
   * @param {string} message - The message to display
   * @param {string} actionLabel - Label for the action button
   * @returns {Promise<boolean>} - True if action button clicked, false if cancel/dismissed
   */
  static async promptActionOrCancel(title, message, actionLabel) {
    return this.showModal({
      title,
      message,
      buttons: [
        { label: actionLabel, isPrimary: true, resolvesTo: true },
        { label: "Use cached version", isPrimary: false, resolvesTo: false },
      ],
      focusPrimary: true,
      closeResolvesTo: false,
    });
  }

  /**
   * Create a close button for toasts
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement} The button element
   */
  static createCloseButton(onClick) {
    const closeBtn = document.createElement("button");
    closeBtn.className = "notification-toast__close";
    closeBtn.setAttribute("aria-label", "Close notification");
    closeBtn.innerHTML = "×";
    closeBtn.onclick = onClick;
    return closeBtn;
  }

  /**
   * Create a modal dialog with backdrop
   * @param {Object} config - Modal configuration
   * @param {string} config.title - Modal title
   * @param {string} config.message - Modal message
   * @param {string} config.type - Modal visual type
   * @param {boolean} config.blockBackdrop - When true, clicking outside/Escape does not dismiss
   * @param {Array} config.buttons - Array of button configs
   * @returns {Object} Object containing backdrop and buttons array
   */
  static createModal({ title, message, type = "info", blockBackdrop = false, buttons }) {
    const backdrop = document.createElement("div");
    backdrop.className = blockBackdrop
      ? "notification-modal-backdrop notification-modal-backdrop--blocking"
      : "notification-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = `notification-modal notification-modal--${type}`;
    modal.setAttribute("role", "alertdialog");
    // Use unique IDs for accessibility
    const modalId = `notification-modal-${++this.modalId}`;
    const titleId = `${modalId}-title`;
    const messageId = `${modalId}-message`;
    modal.setAttribute("aria-labelledby", titleId);
    modal.setAttribute("aria-describedby", messageId);

    const titleEl = document.createElement("h3");
    titleEl.id = titleId;
    titleEl.className = "notification-modal__title";
    titleEl.textContent = title;

    const messageEl = document.createElement("p");
    messageEl.id = messageId;
    messageEl.className = "notification-modal__message";
    messageEl.textContent = message;

    const content = document.createElement("div");
    content.className = "notification-modal__content";

    const icon = this.getIcon(type);
    icon.classList.add("notification-modal__icon");

    const copy = document.createElement("div");
    copy.className = "notification-modal__copy";
    copy.appendChild(titleEl);
    copy.appendChild(messageEl);

    content.appendChild(icon);
    content.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "notification-modal__actions";

    buttons.forEach((button) => {
      const btn = document.createElement("button");
      btn.className = button.isPrimary ? "btn btn--sm btn--primary" : "btn btn--sm";
      btn.textContent = button.label;
      btn.onclick = button.onClick;
      button.element = btn;
      actions.appendChild(btn);
    });

    modal.appendChild(content);
    modal.appendChild(actions);
    backdrop.appendChild(modal);

    return { backdrop, modal, buttons };
  }

  /**
   * Show a modal dialog that returns a promise
   * @param {Object} config - Modal configuration
   * @returns {Promise<*>} Resolves with the selected button's value or closeResolvesTo
   */
  static async showModal(config) {
    return new Promise((resolve) => {
      const { backdrop, modal, buttons } = this.createModal({
        ...config,
        buttons: config.buttons.map((btn) => ({
          ...btn,
          onClick: () => {
            if (typeof btn.onResolve === "function") {
              btn.onResolve();
            }
            cleanup();
            resolve(btn.resolvesTo);
          },
        })),
      });

      document.body.appendChild(backdrop);

      const primaryButton = buttons.find((b) => b.isPrimary);
      const buttonToFocus =
        config.focusPrimary && primaryButton ? primaryButton.element : buttons[0].element;

      // Use requestAnimationFrame for more reliable focus
      requestAnimationFrame(() => buttonToFocus?.focus());

      let escapeHandler;
      const cleanup = () => {
        backdrop.classList.add("notification-modal-backdrop--hide");
        setTimeout(() => {
          if (backdrop.parentNode) {
            backdrop.remove();
          }
        }, 200);
        // Remove escape handler on any close
        if (escapeHandler) {
          document.removeEventListener("keydown", escapeHandler);
          escapeHandler = null;
        }
      };

      const shakeModal = () => {
        if (!modal || modal.classList.contains("notification-modal--shake")) return;
        modal.classList.add("notification-modal--shake");
        modal.addEventListener(
          "animationend",
          () => modal.classList.remove("notification-modal--shake"),
          {
            once: true,
          },
        );
      };

      if (config.blockBackdrop) {
        // Blocked: shake modal on outside click / Escape instead of dismissing
        backdrop.onclick = (e) => {
          if (e.target === backdrop) shakeModal();
        };

        escapeHandler = (e) => {
          if (e.key === "Escape") shakeModal();
        };
      } else {
        // Close on backdrop click
        backdrop.onclick = (e) => {
          if (e.target === backdrop) {
            cleanup();
            resolve(config.closeResolvesTo ?? false);
          }
        };

        // Close on Escape key
        escapeHandler = (e) => {
          if (e.key === "Escape") {
            cleanup();
            resolve(config.closeResolvesTo ?? false);
          }
        };
      }

      document.addEventListener("keydown", escapeHandler);
    });
  }
}
