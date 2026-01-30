/**
 * Notification System
 * Modern toast notification system to replace native alerts
 */

export class Notification {
    static container = null;
    static toastId = 0;
    static modalId = 0;

    /**
     * Initialize the notification container
     */
    static init() {
        if (this.container) return;
        if (!document.body) {
            // Wait for DOMContentLoaded if body is not ready
            document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
            return;
        }
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(this.container);
    }

    /**
     * Show a notification toast
     * @param {string} message - The message to display
     * @param {string} type - The type of notification: 'success', 'error', 'info', 'warning'
     * @param {number} duration - Duration in milliseconds (0 = no auto-dismiss)
     * @returns {number} The toast ID
     */
    static showToast(message, type = 'info', duration = 3000) {
        this.init();

        const toast = document.createElement('div');
        const toastId = ++this.toastId;
        toast.className = `notification-toast notification-toast--${type}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('data-toast-id', toastId);

        const icon = this.getIcon(type);
        const messageEl = document.createElement('span');
        messageEl.className = 'notification-toast__message';
        messageEl.textContent = message;

        toast.appendChild(icon);
        toast.appendChild(messageEl);

        let autoDismissTimeout = null;
        const closeBtn = this.createCloseButton(() => {
            this.dismiss(toast);
            if (autoDismissTimeout) {
                clearTimeout(autoDismissTimeout);
            }
        });
        toast.appendChild(closeBtn);

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('notification-toast--show');
        });

        // Auto-dismiss after duration
        if (duration > 0) {
            autoDismissTimeout = setTimeout(() => this.dismiss(toast), duration);
        }

        return toastId;
    }

    /**
     * Get icon element for notification type
     * @param {string} type - The notification type
     * @returns {HTMLElement} The icon element
     */
    static getIcon(type) {
        const icon = document.createElement('span');
        icon.className = 'notification-toast__icon';
        icon.setAttribute('aria-hidden', 'true');

        const iconMap = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        icon.innerHTML = iconMap[type] || iconMap.info;
        return icon;
    }

    /**
     * Dismiss a notification toast
     * @param {HTMLElement} toast - The toast element to dismiss
     */
    static dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        toast.classList.remove('notification-toast--show');
        toast.classList.add('notification-toast--hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }

    /**
     * Convenience methods for different notification types
     */
    static success(message, duration = 3000) {
        return this.showToast(message, 'success', duration);
    }

    static error(message, duration = 5000) {
        return this.showToast(message, 'error', duration);
    }

    static warning(message, duration = 4000) {
        return this.showToast(message, 'warning', duration);
    }

    static info(message, duration = 3000) {
        return this.showToast(message, 'info', duration);
    }

    /**
     * Show a confirmation dialog with promise-based response
     * @param {string} message - The confirmation message
     * @returns {Promise<boolean>} - True if confirmed, false if cancelled
     */
    static async confirm(message) {
        return this.showModal({
            title: 'Confirm Action',
            message,
            buttons: [
                { label: 'Cancel', isPrimary: false, resolvesTo: false },
                { label: 'Confirm', isPrimary: true, resolvesTo: true }
            ],
            focusPrimary: false
        });
    }

    /**
     * Show an alert dialog with a custom action button
     * @param {string} title - The dialog title
     * @param {string} message - The message to display
     * @param {string} actionLabel - Label for the action button
     * @param {Function} onAction - Callback when action button is clicked
     */
    static alertWithAction(title, message, actionLabel, onAction) {
        this.showModalNonBlocking({
            title,
            message,
            buttons: [
                { label: actionLabel, isPrimary: true, onClick: onAction },
                { label: 'Close', isPrimary: false, onClick: () => {} }
            ],
            focusPrimary: true
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
                { label: 'Use cached version', isPrimary: false, resolvesTo: false }
            ],
            focusPrimary: true,
            closeResolvesTo: false
        });
    }

    /**
     * Create a close button for toasts
     * @param {Function} onClick - Click handler
     * @returns {HTMLElement} The button element
     */
    static createCloseButton(onClick) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-toast__close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.innerHTML = '×';
        closeBtn.onclick = onClick;
        return closeBtn;
    }

    /**
     * Create a modal dialog with backdrop
     * @param {Object} config - Modal configuration
     * @param {string} config.title - Modal title
     * @param {string} config.message - Modal message
     * @param {Array} config.buttons - Array of button configs
     * @returns {Object} Object containing backdrop and buttons array
     */
    static createModal({ title, message, buttons }) {
        const backdrop = document.createElement('div');
        backdrop.className = 'notification-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'notification-modal';
        modal.setAttribute('role', 'alertdialog');
        // Use unique IDs for accessibility
        const modalId = `notification-modal-${++this.modalId}`;
        const titleId = `${modalId}-title`;
        const messageId = `${modalId}-message`;
        modal.setAttribute('aria-labelledby', titleId);
        modal.setAttribute('aria-describedby', messageId);

        const titleEl = document.createElement('h3');
        titleEl.id = titleId;
        titleEl.className = 'notification-modal__title';
        titleEl.textContent = title;

        const messageEl = document.createElement('p');
        messageEl.id = messageId;
        messageEl.className = 'notification-modal__message';
        messageEl.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'notification-modal__actions';

        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.className = button.isPrimary ? 'btn btn--sm btn--primary' : 'btn btn--sm';
            btn.textContent = button.label;
            btn.onclick = button.onClick;
            button.element = btn;
            actions.appendChild(btn);
        });

        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(actions);
        backdrop.appendChild(modal);

        return { backdrop, buttons };
    }

    /**
     * Show a modal dialog that returns a promise
     * @param {Object} config - Modal configuration
     * @returns {Promise<*>} Resolves with the selected button's value or closeResolvesTo
     */
    static async showModal(config) {
        return new Promise((resolve) => {
            const { backdrop, buttons } = this.createModal({
                ...config,
                buttons: config.buttons.map(btn => ({
                    ...btn,
                    onClick: () => {
                        cleanup();
                        resolve(btn.resolvesTo);
                    }
                }))
            });

            document.body.appendChild(backdrop);

            const primaryButton = buttons.find(b => b.isPrimary);
            const buttonToFocus = config.focusPrimary && primaryButton
                ? primaryButton.element
                : buttons[0].element;

            // Use requestAnimationFrame for more reliable focus
            requestAnimationFrame(() => buttonToFocus?.focus());

            let escapeHandler;
            const cleanup = () => {
                backdrop.classList.add('notification-modal-backdrop--hide');
                setTimeout(() => {
                    if (backdrop.parentNode) {
                        backdrop.remove();
                    }
                }, 200);
                // Remove escape handler on any close
                if (escapeHandler) {
                    document.removeEventListener('keydown', escapeHandler);
                    escapeHandler = null;
                }
            };

            // Close on backdrop click
            backdrop.onclick = (e) => {
                if (e.target === backdrop) {
                    cleanup();
                    resolve(config.closeResolvesTo ?? false);
                }
            };

            // Close on Escape key
            escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(config.closeResolvesTo ?? false);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        });
    }

    /**
     * Show a modal dialog that doesn't return a promise (fire-and-forget)
     * @param {Object} config - Modal configuration
     */
    static showModalNonBlocking(config) {
        const { backdrop, buttons } = this.createModal({
            ...config,
            buttons: config.buttons.map(btn => ({
                ...btn,
                onClick: () => {
                    cleanup();
                    btn.onClick?.();
                }
            }))
        });

        document.body.appendChild(backdrop);

        const primaryButton = buttons.find(b => b.isPrimary);
        const buttonToFocus = config.focusPrimary && primaryButton
            ? primaryButton.element
            : buttons[0].element;

        requestAnimationFrame(() => buttonToFocus?.focus());

        let escapeHandler;
        const cleanup = () => {
            backdrop.classList.add('notification-modal-backdrop--hide');
            setTimeout(() => {
                if (backdrop.parentNode) {
                    backdrop.remove();
                }
            }, 200);
            if (escapeHandler) {
                document.removeEventListener('keydown', escapeHandler);
                escapeHandler = null;
            }
        };

        // Close on backdrop click
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                cleanup();
            }
        };

        // Close on Escape key
        escapeHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }
}
