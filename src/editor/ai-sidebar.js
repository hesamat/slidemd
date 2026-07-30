/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * For small decks (≤8 slides): single API call.
 * For larger decks: 2-worker parallel batch processing with per-batch retry.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
   * Show the AI sidebar and stream the response.
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode) {
    this.cancel();
    this.close();
    const myShowId = Symbol();
    this._showId = myShowId;

    const panel = this.#createPanel(mode);
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const outputEl = panel.querySelector(`.${P}output`);
    const statusEl = panel.querySelector(`.${P}status`);
    const noticeEl = panel.querySelector(`.${P}notice`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const retryBtn = panel.querySelector('[data-action="retry"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');
    const progressInline = panel.querySelector(`.${P}progress-inline`);
    const progressCount = panel.querySelector(`.${P}progress-count`);
    const headerEl = panel.querySelector(`.${P}header`);

    let cancelled = false;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    const finish = () => {
      if (this._showId === myShowId) {
        this._finishResolve?.();
      }
    };

    closeBtn.addEventListener("click", finish);
    seeResultBtn.addEventListener("click", finish);

    retryBtn.addEventListener("click", () => {
      retryBtn.hidden = true;
      cancelBtn.hidden = false;
      closeBtn.hidden = true;
      noticeEl.hidden = true;
      outputEl.textContent = "";
      outputEl.hidden = false;
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
      statusEl.textContent = 'Done! Click "See result" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      noticeEl.hidden = false;
      cancelBtn.hidden = true;
      retryBtn.hidden = true;
      closeBtn.hidden = true;
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

    const updateProgress = (completedSlides, totalSlides, nextBatch) => {
      if (progressCount) progressCount.textContent = `${completedSlides}/${totalSlides}`;
      if (nextBatch) {
        statusEl.textContent = `Processing slides ${nextBatch.start + 1}\u2013${nextBatch.end} of ${totalSlides}\u2026`;
      }
    };

    const { buildDeckSummary, splitSlides, slidesToMarkdown, BATCH_SIZE } =
      await import("../data/ai-enhancer.js");

    const run = async () => {
      try {
        const apiKey = SettingsModal.getApiKey();
        const model = SettingsModal.getModel();

        if (!apiKey) {
          showError("No API key \u2014 open Settings to configure");
          return null;
        }

        const modelMaxOutput = SettingsModal.getModelMaxTokens(model);
        const useReasoning = SettingsModal.getReasoning();
        const effort = SettingsModal.getEffort();

        // Split into slides to decide single vs batch path
        const allSlides = splitSlides(markdown, mode);

        // ── Single-call path (≤BATCH_SIZE slides) ──
        if (allSlides.length <= BATCH_SIZE) {
          return await this.#runSingleCall(markdown, mode, {
            apiKey,
            model,
            modelMaxOutput,
            useReasoning,
            effort,
            statusEl,
            noticeEl,
            isCancelled: () => cancelled,
          });
        }

        // ── Batch path (>BATCH_SIZE slides) ──
        const batches = [];
        for (let i = 0; i < allSlides.length; i += BATCH_SIZE) {
          batches.push({ start: i, end: Math.min(i + BATCH_SIZE, allSlides.length) });
        }

        const deckSummary = mode === "generate" ? buildDeckSummary(markdown) : null;

        // Show progress UI
        outputEl.textContent = "";
        outputEl.hidden = false;
        noticeEl.hidden = true;
        progressInline.hidden = false;
        progressCount.textContent = `0/${allSlides.length}`;
        statusEl.textContent = `Processing slides 1\u2013${Math.min(BATCH_SIZE, allSlides.length)} of ${allSlides.length}\u2026`;
        statusEl.className = `${P}status`;
        headerEl.classList.add(`${P}header--active`);
        appendLog(
          `Split ${allSlides.length} slides into ${batches.length} batches of ${batches.length > 1 ? BATCH_SIZE : allSlides.length}`,
        );

        // 2-worker parallel batch loop
        const results = new Array(batches.length);
        let completedSlides = 0;
        let retryCount = 0;
        let splitCount = 0;
        const retryAttempts = new Map(); // batch key -> attempt count
        const queue = batches.map((b, i) => ({ ...b, index: i, batchKey: `${b.start}-${b.end}` }));

        const worker = async (_workerName) => {
          while (queue.length > 0) {
            if (cancelled) break;
            const batch = queue.shift();

            const batchResult = await this.#streamBatch({
              markdown,
              mode,
              batch,
              totalSlides: allSlides.length,
              deckSummary,
              apiKey,
              model,
              modelMaxOutput,
              useReasoning,
              effort,
              signal: this._abortControllers[0]?.signal,
            });

            if (batchResult === null) {
              // Cancelled
              break;
            }

            if (batchResult.error) {
              const attempts = (retryAttempts.get(batch.batchKey) || 0) + 1;
              retryAttempts.set(batch.batchKey, attempts);

              if (batchResult.error.type === "truncation") {
                appendLog(
                  `\u26A0 Batch ${batch.index + 1}: response truncated \u2014 splitting into 2\u00D7${Math.ceil((batch.end - batch.start) / 2)} slides`,
                  "warn",
                );
                splitCount++;
                const mid = batch.start + Math.ceil((batch.end - batch.start) / 2);
                queue.unshift(
                  {
                    start: batch.start,
                    end: mid,
                    index: batch.index,
                    batchKey: `${batch.start}-${mid}`,
                  },
                  {
                    start: mid,
                    end: batch.end,
                    index: batch.index,
                    batchKey: `${mid}-${batch.end}`,
                  },
                );
              } else if (batchResult.error.type === "validation" && attempts < 2) {
                const errs = batchResult.error.errors;
                console.warn(
                  `[AI Fix] Batch ${batch.index + 1} (slides ${batch.start + 1}\u2013${batch.end}): ${errs.length} validation issue(s):`,
                );
                for (const e of errs) {
                  console.warn(`  - ${e}`);
                }
                appendLog(
                  `\u21BB Batch ${batch.index + 1}: ${errs.length} validation issue${errs.length === 1 ? "" : "s"} \u2014 retrying...`,
                  "warn",
                );
                retryCount++;
                queue.unshift(batch);
              } else if (attempts < 2) {
                appendLog(
                  `\u21BB Batch ${batch.index + 1}: ${batchResult.error.type} \u2014 retrying...`,
                  "warn",
                );
                retryCount++;
                queue.unshift(batch);
              } else {
                const errs =
                  batchResult.error.type === "validation" ? batchResult.error.errors : [];
                if (errs.length > 0) {
                  console.warn(
                    `[AI Fix] Batch ${batch.index + 1}: failed after ${attempts} attempt(s) with ${errs.length} validation issue(s):`,
                  );
                  for (const e of errs) {
                    console.warn(`  - ${e}`);
                  }
                }
                appendLog(
                  `\u2717 Batch ${batch.index + 1}: failed (${batchResult.error.type})`,
                  "error",
                );
                completedSlides += batch.end - batch.start;
                const nextBatch = queue.length > 0 ? queue[0] : null;
                updateProgress(completedSlides, allSlides.length, nextBatch);
              }
            } else {
              results[batch.index] = batchResult.slides;
              completedSlides += batch.end - batch.start;
              const nextBatch = queue.length > 0 ? queue[0] : null;
              updateProgress(completedSlides, allSlides.length, nextBatch);
              appendLog(
                `\u2713 Batch ${batch.index + 1}: slides ${batch.start + 1}\u2013${batch.end} done (${batchResult.duration.toFixed(1)}s)`,
              );
            }
          }
        };

        // Create2 AbortControllers
        const ctrl1 = new AbortController();
        const ctrl2 = new AbortController();
        this._abortControllers = [ctrl1, ctrl2];

        await Promise.all([worker("A"), worker("B")]);

        // All done
        if (cancelled) {
          this.close();
          return null;
        }

        // Check for partial results
        const failedBatches = results.filter((r) => r === undefined).length;
        if (failedBatches > 0) {
          showError(
            `Batch processing failed \u2014 ${completedSlides}/${allSlides.length} slides completed. ` +
              `Try again or reduce deck size.`,
          );
          return null;
        }

        // Combine results in order
        const allResultSlides = results.flat();
        const summaryParts = [`${allSlides.length} slides processed`];
        if (retryCount > 0)
          summaryParts.push(`${retryCount} retr${retryCount === 1 ? "y" : "ies"}`);
        if (splitCount > 0) summaryParts.push(`${splitCount} split${splitCount === 1 ? "" : "s"}`);
        appendLog(`\u2714 ${summaryParts.join(", ")}`);
        const combined = slidesToMarkdown(allResultSlides);
        return combined;
      } catch (err) {
        if (err.name === "AbortError") {
          this.close();
          return null;
        }
        showError(`Error: ${err.message}`);
        return null;
      }
    };

    // Run
    let runResult = await run();

    // Retry loop
    while (!runResult && retryBtn.hidden === false && !cancelled) {
      await new Promise((resolve) => {
        this._retryResolve = resolve;
      });
      if (cancelled || this._showId !== myShowId) break;
      runResult = await run();
    }

    if (runResult) {
      showDone();
      await new Promise((resolve) => {
        this._finishResolve = resolve;
      });
    }

    if (this._showId === myShowId) {
      this._currentPanel = null;
    }
    panel.remove();
    return runResult;
  }

  /**
   * Single API call path (small decks).
   * For fix mode, validates output and retries with escalation on failure.
   */
  static async #runSingleCall(markdown, mode, opts) {
    const { apiKey, model, modelMaxOutput, useReasoning, effort, statusEl, noticeEl, isCancelled } =
      opts;

    const {
      buildMessages,
      estimateMaxTokens,
      parseAiResponse,
      slidesToMarkdown,
      extractDirectives,
      validateFixOutput,
    } = await import("../data/ai-enhancer.js");

    const originalDirectives = extractDirectives(markdown);
    const maxAttempts = mode === "fix" ? 3 : 1;
    let lastErrors = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { system, user } = buildMessages(markdown, mode);
      const escalatedUser =
        attempt > 1
          ? user +
            `\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${lastErrors.join("\n")}\n\nYou MUST preserve original layouts and heading levels exactly. Do NOT change layouts or heading levels.`
          : user;

      const inputTokens = estimateMaxTokens(markdown, mode, {
        modelMaxOutput,
        useReasoning,
      });
      statusEl.textContent =
        attempt > 1
          ? `Retry ${attempt}/${maxAttempts} (${lastErrors.length} issue${lastErrors.length === 1 ? "" : "s"})\u2026`
          : `Sending (~${inputTokens.toLocaleString()} tokens)\u2026`;

      const ctrl = new AbortController();
      this._abortControllers = [ctrl];

      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: escalatedUser },
        ],
        max_tokens: inputTokens,
        stream: false,
        response_format: { type: "json_object" },
      };
      if (useReasoning) {
        body.reasoning = { effort };
      }

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorText.slice(0, 200)}`);
      }

      noticeEl.hidden = false;
      statusEl.textContent = "AI is working\u2026";

      const json = await res.json();
      const contentText = json.choices?.[0]?.message?.content || "";
      const finishReason = json.choices?.[0]?.finish_reason;

      if (isCancelled()) {
        this.close();
        return null;
      }

      if (finishReason === "length") {
        const limitDisplay = modelMaxOutput
          ? `${modelMaxOutput.toLocaleString()} tokens`
          : "unknown";
        throw new Error(
          `Response truncated \u2014 the AI hit its output token limit (${limitDisplay} for ${model}). ` +
            `Your deck may be too large for a single pass. Try reducing the number of slides, ` +
            `or switch to a model with a higher output token limit.`,
        );
      }

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        throw new Error("AI did not return valid JSON");
      }

      // Validate fix mode output (slide count only — layout restored post-AI)
      if (mode === "fix") {
        const validation = validateFixOutput(originalDirectives, parsed.slides);
        if (validation.valid) {
          return slidesToMarkdown(parsed.slides);
        }
        lastErrors = validation.errors;
        console.warn(
          `[AI Fix] Attempt ${attempt}: ${validation.errors.length} validation issue(s):`,
        );
        for (const err of validation.errors) {
          console.warn(`  - ${err}`);
        }
        if (attempt < maxAttempts) {
          continue; // retry with escalation
        }
        // Last attempt failed — accept but log warnings
        console.warn("[AI Fix] Accepting output after max attempts with validation issues");
      }

      return slidesToMarkdown(parsed.slides);
    }

    // Should not reach here, but handle gracefully
    return null;
  }

  /**
   * Stream a single batch and return parsed slides.
   * For fix mode, validates output before returning.
   * @returns {Promise<{slides: Array, duration: number}|{error: object}|null>}
   */
  static async #streamBatch(opts) {
    const {
      markdown,
      mode,
      batch,
      totalSlides,
      deckSummary,
      apiKey,
      model,
      modelMaxOutput,
      useReasoning,
      effort,
      signal,
    } = opts;

    const {
      buildBatchMessages,
      estimateMaxTokens,
      parseAiResponse,
      extractDirectives,
      validateFixOutput,
    } = await import("../data/ai-enhancer.js");

    const batchMarkdown = (() => {
      const cleaned = markdown
        .split(/\n---\n/)
        .slice(batch.start, batch.end)
        .join("\n\n---\n\n");
      return cleaned;
    })();

    const { system, user } = buildBatchMessages(
      markdown,
      mode,
      batch.start,
      batch.end,
      totalSlides,
      deckSummary,
    );

    const inputTokens = estimateMaxTokens(batchMarkdown, mode, {
      modelMaxOutput,
      useReasoning,
    });

    const body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: inputTokens,
      stream: false,
      response_format: { type: "json_object" },
    };
    if (useReasoning) {
      body.reasoning = { effort };
    }

    const startTime = performance.now();

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const json = await res.json();
      const contentText = json.choices?.[0]?.message?.content || "";
      const finishReason = json.choices?.[0]?.finish_reason;

      const duration = (performance.now() - startTime) / 1000;

      if (finishReason === "length") {
        return { error: { type: "truncation" } };
      }

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        return { error: { type: "parse-error" } };
      }

      // Validate fix mode output (slide count only — layout restored post-AI)
      if (mode === "fix") {
        const origDirectives = extractDirectives(markdown).slice(batch.start, batch.end);
        const validation = validateFixOutput(origDirectives, parsed.slides);
        if (!validation.valid) {
          return { error: { type: "validation", errors: validation.errors } };
        }
      }

      return { slides: parsed.slides, duration };
    } catch (err) {
      if (err.name === "AbortError") return null;
      return { error: { type: "network-error", message: err.message } };
    }
  }

  static #createPanel(mode) {
    const panel = document.createElement("div");
    panel.className = P + "panel";
    const title = mode === "fix" ? "AI: Fix Issues" : "AI: Inspired Deck";
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
      <div class="${P}output"></div>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn">Cancel</button>
        <button type="button" data-action="retry" class="${P}btn" hidden>Try again</button>
        <button type="button" data-action="see-result" class="${P}btn ${P}btn--primary" hidden>See result</button>
        <button type="button" data-action="close" class="${P}btn" hidden>Close</button>
      </div>
    `;
    return panel;
  }
}
