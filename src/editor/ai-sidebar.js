/**
 * AiSidebar
 *
 * Thin, non-blocking UI shell for AI processing. All LLM calls, batching,
 * validation, and repair live in AiOrchestrator — this class only owns the
 * panel UI (progress, retry, cancel) and drives it via orchestrator callbacks.
 */

const P = "ai-sidebar__";

export class AiSidebar {
  static _currentPanel = null;
  static _abortControllers = [];
  static _minimized = false;
  static _showId = null;

  static cancel() {
    for (const ctrl of this._abortControllers) {
      ctrl.abort();
    }
    this._abortControllers = [];
  }

  static close() {
    this.cancel();
    this._showId = null;
    if (this._finishResolve) {
      this._finishResolve();
      this._finishResolve = null;
    }
    if (this._currentPanel) {
      this._currentPanel.remove();
      this._currentPanel = null;
      this._minimized = false;
    }
  }

  /**
   * Show the AI sidebar and run a whole-deck "generate" operation through
   * the orchestrator.
   * @param {import("../data/ai/ai-operation.js").AiOperation} operation
   * @param {import("../data/ai/ai-orchestrator.js").AiOrchestrator} orchestrator
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(operation, orchestrator) {
    this.cancel();
    this.close();
    const myShowId = Symbol();
    this._showId = myShowId;

    const panel = this.#createPanel("generate");
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const outputEl = panel.querySelector(`.${P}output`);
    const statusEl = panel.querySelector(`.${P}status`);
    const noticeEl = panel.querySelector(`.${P}notice`);
    const planEl = panel.querySelector(`.${P}plan`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const retryBtn = panel.querySelector('[data-action="retry"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');
    const progressInline = panel.querySelector(`.${P}progress-inline`);
    const progressCount = panel.querySelector(`.${P}progress-count`);
    const headerEl = panel.querySelector(`.${P}header`);

    let cancelled = false;
    let closed = false;
    let discarded = false;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    const finish = () => {
      if (this._showId === myShowId) {
        this._finishResolve?.();
      }
    };

    seeResultBtn.addEventListener("click", finish);
    // Close serves two purposes depending on panel state:
    // - After an error, it must break out of the retry loop below, which
    //   awaits _retryResolve rather than _finishResolve. Without this the
    //   panel would hang forever after an error when the user clicks Close.
    // - After a successful run, it is relabeled "Discard" so the user can
    //   abandon the AI result instead of applying it.
    closeBtn.addEventListener("click", () => {
      closed = true;
      discarded = true;
      this._retryResolve?.();
      finish();
    });

    retryBtn.addEventListener("click", () => {
      retryBtn.hidden = true;
      cancelBtn.hidden = false;
      closeBtn.hidden = true;
      noticeEl.hidden = true;
      outputEl.textContent = "";
      outputEl.hidden = false;
      if (planEl) planEl.hidden = true;
      statusEl.textContent = "Preparing\u2026";
      statusEl.className = `${P}status`;
      progressInline.hidden = true;
      headerEl.classList.remove(`${P}header--active`);
      this._retryResolve?.();
    });

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "\u2212";
    });

    const showError = (msg) => {
      statusEl.textContent = msg;
      statusEl.className = `${P}status ${P}status--error`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      retryBtn.hidden = false;
      closeBtn.hidden = false;
      closeBtn.textContent = "Close";
      progressInline.hidden = true;
      headerEl.classList.remove(`${P}header--active`);
      outputEl.hidden = false;
    };

    const showDone = () => {
      statusEl.textContent = 'Done! Click "Apply changes" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      retryBtn.hidden = true;
      closeBtn.hidden = false;
      closeBtn.textContent = "Discard";
      seeResultBtn.hidden = false;
      progressInline.hidden = true;
      outputEl.hidden = false;
      headerEl.classList.remove(`${P}header--active`);
      panel.classList.add(`${P}panel--done`);
    };

    const appendLog = (text, type = "info") => {
      outputEl.hidden = false;
      const line = document.createElement("div");
      line.className = `${P}log-line ${P}log-line--${type}`;
      line.textContent = text;
      outputEl.appendChild(line);
      outputEl.scrollTop = outputEl.scrollHeight;
    };

    const renderPlan = (plan, sourceCount, mode) => {
      if (!planEl) return;
      planEl.innerHTML = "";
      const planLabel = mode
        ? `${mode.charAt(0).toUpperCase() + mode.slice(1)} plan`
        : "Remix plan";
      const keepCount = plan.filter((e) => e.action === "keep").length;
      const rewriteCount = plan.filter((e) => e.action === "rewrite").length;
      const mergeCount = plan.filter((e) => e.action === "merge").length;
      const parts = [];
      if (keepCount) parts.push(`${keepCount} keep`);
      if (rewriteCount) parts.push(`${rewriteCount} rewrite`);
      if (mergeCount) parts.push(`${mergeCount} merge`);
      const summary = `${plan.length} slides from ${sourceCount} source (${parts.join(", ")})`;

      // Foldable header — click to toggle the plan body
      const header = document.createElement("button");
      header.type = "button";
      header.className = `${P}plan-header`;
      header.setAttribute("aria-expanded", "true");
      const headerIcon = document.createElement("span");
      headerIcon.className = `${P}plan-chevron`;
      headerIcon.textContent = "\u25BC";
      const headerText = document.createElement("span");
      headerText.className = `${P}plan-header-text`;
      headerText.textContent = `${planLabel} \u2014 ${summary}`;
      header.appendChild(headerIcon);
      header.appendChild(headerText);

      // Collapsible body
      const body = document.createElement("div");
      body.className = `${P}plan-body`;
      for (const entry of plan) {
        const sourceLabel = entry.source.map((s) => s + 1).join("+");
        const row = document.createElement("div");
        row.className = `${P}plan-row ${P}plan-row--${entry.action}`;
        const badge = document.createElement("span");
        badge.className = `${P}plan-badge ${P}plan-badge--${entry.action}`;
        badge.textContent = entry.action;
        const label = document.createElement("span");
        label.className = `${P}plan-label`;
        if (entry.action === "keep") {
          label.textContent = `Slide ${sourceLabel}: ${entry.title}`;
        } else if (entry.action === "merge") {
          label.textContent = `Slides ${sourceLabel} \u2192 ${entry.title} \u2014 ${entry.brief || ""}`;
        } else {
          label.textContent = `Slide ${sourceLabel}: ${entry.title} \u2014 ${entry.brief || ""}`;
        }
        row.appendChild(badge);
        row.appendChild(label);
        body.appendChild(row);
      }

      header.addEventListener("click", () => {
        const expanded = header.getAttribute("aria-expanded") === "true";
        header.setAttribute("aria-expanded", String(!expanded));
        body.hidden = expanded;
        headerIcon.textContent = expanded ? "\u25B6" : "\u25BC";
      });

      planEl.appendChild(header);
      planEl.appendChild(body);
      planEl.hidden = false;
    };

    const updateProgress = (completedSlides, totalSlides, nextBatch) => {
      if (progressCount) progressCount.textContent = `${completedSlides}/${totalSlides}`;
      if (nextBatch) {
        statusEl.textContent = `Reading slides ${nextBatch.start + 1}\u2013${nextBatch.end} of ${totalSlides}\u2026`;
      }
    };

    const run = async () => {
      outputEl.textContent = "";
      outputEl.hidden = false;
      noticeEl.hidden = true;
      if (planEl) {
        planEl.innerHTML = "";
        planEl.hidden = true;
      }
      statusEl.textContent = "Preparing\u2026";
      statusEl.className = `${P}status`;
      headerEl.classList.add(`${P}header--active`);

      const ctrl = new AbortController();
      this._abortControllers = [ctrl];

      try {
        const enhancedMarkdown = await orchestrator.runWholeDeckOperation(operation, ctrl.signal, {
          onProgress: (completedSlides, totalSlides, nextBatch) => {
            progressInline.hidden = false;
            updateProgress(completedSlides, totalSlides, nextBatch);
          },
          onLog: (message, level) => appendLog(message, level || "info"),
          onPlan: (plan, sourceCount, mode) => renderPlan(plan, sourceCount, mode),
        });

        if (cancelled) {
          this.close();
          return null;
        }

        if (!enhancedMarkdown) {
          showError("AI returned no content \u2014 try again");
          return null;
        }

        return enhancedMarkdown;
      } catch (err) {
        if (err.name === "AbortError" || err.name === "AiAbortError") {
          this.close();
          return null;
        }
        showError(err.userMessage || err.message);
        return null;
      }
    };

    // Run
    let runResult = await run();

    // Retry loop
    while (!runResult && retryBtn.hidden === false && !cancelled && !closed) {
      await new Promise((resolve) => {
        this._retryResolve = resolve;
      });
      if (cancelled || closed || this._showId !== myShowId) break;
      runResult = await run();
    }

    if (runResult) {
      showDone();
      await new Promise((resolve) => {
        this._finishResolve = resolve;
      });
      if (discarded) runResult = null;
    }

    if (this._showId === myShowId) {
      this._currentPanel = null;
    }
    panel.remove();
    return runResult;
  }

  /**
   * Show a lightweight panel for a single-slide AI operation.
   * Runs the operation through the orchestrator and returns the patches.
   * @param {import("../data/ai/ai-operation.js").AiOperation} operation
   * @param {import("../data/ai/ai-orchestrator.js").AiOrchestrator} orchestrator
   * @param {string} intent — for display purposes
   * @returns {Promise<import("../data/store/slide-patch.js").SlidePatch[]|null>}
   */
  static async showSingleSlideOperation(operation, orchestrator, intent) {
    this.cancel();
    this.close();
    const myShowId = Symbol();
    this._showId = myShowId;

    const panel = this.#createPanel("single");
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const statusEl = panel.querySelector(`.${P}status`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const retryBtn = panel.querySelector('[data-action="retry"]');
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');
    const noticeEl = panel.querySelector(`.${P}notice`);
    const progressInline = panel.querySelector(`.${P}progress-inline`);
    const headerEl = panel.querySelector(`.${P}header`);

    progressInline.hidden = true;
    noticeEl.hidden = true;
    retryBtn.hidden = true;
    closeBtn.hidden = true;
    seeResultBtn.hidden = true;

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "\u2212";
    });

    const intentLabels = {
      enhanceSlide: "Cleaning up slide",
      addSpeakerNotes: "Adding speaker notes",
    };
    statusEl.textContent = `${intentLabels[intent] || "Processing"}\u2026`;
    headerEl.classList.add(`${P}header--active`);

    let ctrl = new AbortController();
    this._abortControllers = [ctrl];

    let closed = false;
    let discarded = false;

    cancelBtn.addEventListener("click", () => {
      ctrl.abort();
      this.cancel();
    });

    const finish = () => {
      if (this._showId === myShowId) {
        this._finishResolve?.();
      }
    };

    seeResultBtn.addEventListener("click", finish);
    // Close serves two purposes depending on panel state:
    // - After an error, it must break out of the retry loop, which awaits
    //   _retryResolve rather than _finishResolve. Without this the panel
    //   would hang forever after an error when the user clicks Close.
    // - After a successful run, it is relabeled "Discard" so the user can
    //   abandon the AI result instead of applying it.
    closeBtn.addEventListener("click", () => {
      closed = true;
      discarded = true;
      this._retryResolve?.();
      this._finishResolve?.();
    });
    retryBtn.addEventListener("click", () => {
      this._retryResolve?.();
    });

    // No dedicated log panel for single-slide operations — route validation
    // warnings to the console so they remain visible for diagnosis instead
    // of being silently swallowed.
    const onLog = (message, level = "info") => {
      if (level === "warn") console.warn(`[AI] ${message}`);
      else if (level === "error") console.error(`[AI] ${message}`);
    };

    try {
      const { patches } = await orchestrator.runOperation(operation, ctrl.signal, { onLog });
      if (!patches || patches.length === 0) {
        statusEl.textContent = "No changes.";
        statusEl.className = `${P}status`;
        closeBtn.hidden = false;
        closeBtn.textContent = "Close";
        cancelBtn.hidden = true;
        await new Promise((resolve) => {
          this._finishResolve = resolve;
        });
        if (this._showId === myShowId) this._currentPanel = null;
        panel.remove();
        return null;
      }

      statusEl.textContent = 'Done! Click "Apply changes" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      seeResultBtn.hidden = false;
      closeBtn.hidden = false;
      closeBtn.textContent = "Discard";
      headerEl.classList.remove(`${P}header--active`);
      panel.classList.add(`${P}panel--done`);

      await new Promise((resolve) => {
        this._finishResolve = resolve;
      });

      if (this._showId === myShowId) this._currentPanel = null;
      panel.remove();
      return discarded ? null : patches;
    } catch (err) {
      if (err.name === "AbortError" || err.name === "AiAbortError") {
        this.close();
        return null;
      }
      statusEl.textContent = err.userMessage || err.message;
      statusEl.className = `${P}status ${P}status--error`;
      cancelBtn.hidden = true;
      retryBtn.hidden = false;
      closeBtn.hidden = false;
      closeBtn.textContent = "Close";
      headerEl.classList.remove(`${P}header--active`);

      // Retry loop
      while (retryBtn.hidden === false) {
        await new Promise((resolve) => {
          this._retryResolve = resolve;
        });
        if (closed || this._showId !== myShowId) break;
        // Re-run on retry with a fresh AbortController so a previous
        // cancel/abort can't cause every subsequent retry to fail immediately.
        retryBtn.hidden = true;
        cancelBtn.hidden = false;
        statusEl.textContent = `${intentLabels[intent] || "Processing"}\u2026`;
        statusEl.className = `${P}status`;
        headerEl.classList.add(`${P}header--active`);
        ctrl = new AbortController();
        this._abortControllers = [ctrl];
        try {
          const { patches: retryPatches } = await orchestrator.runOperation(
            operation,
            ctrl.signal,
            {
              onLog,
            },
          );
          if (retryPatches && retryPatches.length > 0) {
            statusEl.textContent = 'Done! Click "Apply changes" to apply.';
            statusEl.className = `${P}status ${P}status--done`;
            noticeEl.hidden = true;
            cancelBtn.hidden = true;
            seeResultBtn.hidden = false;
            closeBtn.hidden = false;
            closeBtn.textContent = "Discard";
            headerEl.classList.remove(`${P}header--active`);
            panel.classList.add(`${P}panel--done`);
            await new Promise((resolve) => {
              this._finishResolve = resolve;
            });
            if (this._showId === myShowId) this._currentPanel = null;
            panel.remove();
            return discarded ? null : retryPatches;
          }
        } catch (retryErr) {
          if (retryErr.name === "AbortError" || retryErr.name === "AiAbortError") {
            this.close();
            return null;
          }
          statusEl.textContent = retryErr.userMessage || retryErr.message;
          statusEl.className = `${P}status ${P}status--error`;
          cancelBtn.hidden = true;
          retryBtn.hidden = false;
          headerEl.classList.remove(`${P}header--active`);
        }
      }

      if (this._showId === myShowId) this._currentPanel = null;
      panel.remove();
      return null;
    }
  }

  static #createPanel(mode) {
    const panel = document.createElement("div");
    panel.className = P + "panel";
    const title = mode === "generate" ? "AI: Refine all slides" : "AI: Slide";
    panel.innerHTML = `
      <div class="${P}header">
        <span class="${P}title">${title}</span>
        <div class="${P}header-right">
          <span class="${P}progress-inline" hidden>
            <span class="${P}progress-count">0/0</span>
          </span>
          <button type="button" data-action="minimize" class="${P}icon-btn" title="Minimize">\u2212</button>
        </div>
      </div>
      <div class="${P}status">Starting\u2026</div>
      <div class="${P}notice">AI result not yet applied \u2014 click "See result" when done.</div>
      <div class="${P}plan" hidden></div>
      <details class="${P}log-section" open>
        <summary class="${P}log-summary">Log</summary>
        <div class="${P}output"></div>
      </details>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn">Cancel</button>
        <button type="button" data-action="retry" class="${P}btn" hidden>Try again</button>
        <button type="button" data-action="see-result" class="${P}btn ${P}btn--primary" hidden>Apply changes</button>
        <button type="button" data-action="close" class="${P}btn" hidden>Close</button>
      </div>
    `;
    return panel;
  }
}
