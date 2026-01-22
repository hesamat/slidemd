/**
 * StageScaler
 * Handles responsive scaling of the deck stage to fit within available space.
 * Calculates optimal scale while maintaining the design aspect ratio.
 */

import { DESIGN_SIZE } from './utils.js';

export class StageScaler {
    /**
     * Applies responsive scaling to the stage based on available window size.
     * @param {Object} elements - DOM element references containing stageHost, deckStage, stageInner
     */
    static applyStageScale(elements) {
        const { stageHost: host, deckStage: stage, stageInner: inner } = elements;
        if (!host || !stage || !inner) return;

        const rect = host.getBoundingClientRect();
        const isSmallScreen = window.innerWidth <= 900;
        const isFullscreen = document.fullscreenElement === host;

        // In fullscreen mode, use minimal padding to maximize slide size
        const padding = isFullscreen ? 8 : (isSmallScreen ? 32 : 24);
        const availW = rect.width - padding;
        const availH = rect.height - padding;

        if (availW <= 0 || availH <= 0) {
            setTimeout(() => this.applyStageScale(elements), 100);
            return;
        }

        // On small screens (≤900px), let CSS handle the sizing
        if (isSmallScreen) {
            // On small screens, stage fills container with aspect-ratio 16/9
            // Calculate stage height based on width and 16:9 ratio
            const stageWidth = availW;
            const stageHeight = stageWidth / (16 / 9);
            // Scale the content to fit the stage
            const scale = stageWidth / DESIGN_SIZE.width;
            stage.style.width = '100%';
            stage.style.height = '100%';
            stage.style.maxWidth = `${stageWidth}px`;
            stage.style.maxHeight = `${stageHeight}px`;
            stage.style.setProperty("--stage-scale", scale);
            inner.style.width = `${DESIGN_SIZE.width}px`;
            inner.style.height = `${DESIGN_SIZE.height}px`;
            inner.style.transform = `scale(${scale})`;
            inner.style.transformOrigin = 'center center';
        } else {
            const scale = Math.min(availW / DESIGN_SIZE.width, availH / DESIGN_SIZE.height);
            stage.style.width = `${Math.round(DESIGN_SIZE.width * scale)}px`;
            stage.style.height = `${Math.round(DESIGN_SIZE.height * scale)}px`;
            stage.style.maxWidth = '';
            stage.style.maxHeight = '';
            stage.style.setProperty("--stage-scale", scale);
            inner.style.width = '';
            inner.style.height = '';
            inner.style.transform = `scale(${scale})`;
            inner.style.transformOrigin = 'top left';
        }
    }

    /**
     * Gets the design size constants used for stage scaling calculations.
     * @returns {{ width: number, height: number }} The design dimensions
     */
    static getDesignSize() {
        return { ...DESIGN_SIZE };
    }
}
