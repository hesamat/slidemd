/**
 * Notification System
 * Modern toast notification system to replace native alerts
 */

export class Notification {
    static container = null;
    static toastId = 0;

    /**
     * Initialize the notification container
     */
    static init() {
        if (this.container) return;

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
     */
    static show(message, type = 'info', duration = 3000) {
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

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-toast__close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.dismiss(toast);

        toast.appendChild(icon);
        toast.appendChild(messageEl);
        toast.appendChild(closeBtn);

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('notification-toast--show');
        });

        // Auto-dismiss after duration
        if (duration > 0) {
            setTimeout(() => this.dismiss(toast), duration);
        }

        return toastId;
    }

    /**
     * Get icon element for notification type
     */
    static getIcon(type) {
        const icon = document.createElement('span');
        icon.className = 'notification-toast__icon';
        icon.setAttribute('aria-hidden', 'true');

        switch (type) {
            case 'success':
                icon.innerHTML = '✓';
                break;
            case 'error':
                icon.innerHTML = '✕';
                break;
            case 'warning':
                icon.innerHTML = '⚠';
                break;
            case 'info':
            default:
                icon.innerHTML = 'ℹ';
                break;
        }

        return icon;
    }

    /**
     * Dismiss a notification
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
        return this.show(message, 'success', duration);
    }

    static error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    static warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    static info(message, duration = 3000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Show a confirmation dialog with promise-based response
     * @param {string} message - The confirmation message
     * @returns {Promise<boolean>} - True if confirmed, false if cancelled
     */
    static async confirm(message) {
        return new Promise((resolve) => {
            // Create modal backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'notification-modal-backdrop';

            // Create modal dialog
            const modal = document.createElement('div');
            modal.className = 'notification-modal';
            modal.setAttribute('role', 'alertdialog');
            modal.setAttribute('aria-labelledby', 'modal-title');
            modal.setAttribute('aria-describedby', 'modal-message');

            const title = document.createElement('h3');
            title.id = 'modal-title';
            title.className = 'notification-modal__title';
            title.textContent = 'Confirm Action';

            const messageEl = document.createElement('p');
            messageEl.id = 'modal-message';
            messageEl.className = 'notification-modal__message';
            messageEl.textContent = message;

            const actions = document.createElement('div');
            actions.className = 'notification-modal__actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn--sm';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => {
                cleanup();
                resolve(false);
            };

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn--sm btn--primary';
            confirmBtn.textContent = 'Confirm';
            confirmBtn.onclick = () => {
                cleanup();
                resolve(true);
            };

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);

            modal.appendChild(title);
            modal.appendChild(messageEl);
            modal.appendChild(actions);

            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            // Focus the cancel button for better accessibility
            setTimeout(() => cancelBtn.focus(), 100);

            // Cleanup function
            function cleanup() {
                backdrop.classList.add('notification-modal-backdrop--hide');
                setTimeout(() => {
                    if (backdrop.parentNode) {
                        backdrop.remove();
                    }
                }, 200);
            }

            // Close on backdrop click
            backdrop.onclick = (e) => {
                if (e.target === backdrop) {
                    cleanup();
                    resolve(false);
                }
            };

            // Close on Escape key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escapeHandler);
                    cleanup();
                    resolve(false);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        });
    }
}
