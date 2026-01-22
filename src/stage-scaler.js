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
        const availW = rect.width - 32;
        const availH = rect.height - 32;

        if (availW <= 0 || availH <= 0) {
            setTimeout(() => this.applyStageScale(elements), 100);
            return;
        }

        const scale = Math.min(availW / DESIGN_SIZE.width, availH / DESIGN_SIZE.height, 1);
        stage.style.width = `${Math.round(DESIGN_SIZE.width * scale)}px`;
        stage.style.height = `${Math.round(DESIGN_SIZE.height * scale)}px`;
        stage.style.setProperty("--stage-scale", scale);
        inner.style.transform = `scale(${scale})`;
    }

    /**
     * Gets the design size constants used for stage scaling calculations.
     * @returns {{ width: number, height: number }} The design dimensions
     */
    static getDesignSize() {
        return { ...DESIGN_SIZE };
    }
}
