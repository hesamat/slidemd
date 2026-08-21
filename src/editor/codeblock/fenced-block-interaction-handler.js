/**
 * FencedBlockInteractionHandler
 *
 * Selection, overlay, and drag handling for fenced blocks (Mermaid diagrams
 * and code blocks).  Most of the lifecycle is inherited from
 * BlockInteractionHandler; this class only provides the fenced-block-specific
 * parser, ordinal, and markdown hooks.
 */
import { FencedBlockDragController } from "./fenced-block-drag-controller.js";
import {
  removeFencedBlock,
  getDraggableFencedBlockElement,
  parseFencedBlocksInArea,
  getFencedBlockOrdinalIndexInArea,
  findElementMarkdownPosition,
} from "./fenced-block-utils.js";
import { BlockInteractionHandler } from "../core/block-interaction-handler.js";

export class FencedBlockInteractionHandler extends BlockInteractionHandler {
  static get _overlayClassName() {
    return "fenced-block-overlay";
  }

  static get _selectedClassName() {
    return "fenced-block-selected";
  }

  static get _DragController() {
    return FencedBlockDragController;
  }

  static _dragControllerContext() {
    return {
      getSelected: () => this._selected,
      select: (el) => this.select(el),
      deselect: () => this.deselect(),
      updateOverlay: () => this._updateOverlay(),
      getMarkdown: () => this._getMarkdown?.(),
      setMarkdown: (md) => this._setMarkdown?.(md),
      onMoveArea: (md) => this._onMoveArea?.(md),
      getOverlay: () => this._overlay,
      reorderBlock: (el, targetEl) => this._reorderBlock(el, targetEl),
      buildMoveMarkdown: (el, fromAreaName, toAreaName, insertBeforeEl) =>
        this._buildMoveMarkdown(el, fromAreaName, toAreaName, insertBeforeEl),
    };
  }

  static elementFromTarget(target) {
    return getDraggableFencedBlockElement(target);
  }

  static _isOverlayOrChromeTarget(target) {
    return !!target.closest(".fenced-block-overlay");
  }

  static _parseBlocksInArea(markdown, areaName) {
    return parseFencedBlocksInArea(markdown, areaName);
  }

  static _getBlockOrdinalIndexInArea(el) {
    return getFencedBlockOrdinalIndexInArea(el);
  }

  static _getTargetBlockIndexInArea(targetEl) {
    return targetEl?.matches?.(".mermaid, pre") ? getFencedBlockOrdinalIndexInArea(targetEl) : -1;
  }

  static _findMarkdownPosition(markdown, element) {
    return findElementMarkdownPosition(markdown, element);
  }

  static _removeBlockFromMarkdown(block, markdown) {
    const { markdown: updated } = removeFencedBlock(markdown, block);
    return updated;
  }
}
