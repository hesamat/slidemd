/**
 * Lecture Plan Modal
 * Table-based review and editing UI for lecture plans.
 */

import { Notification } from "../renderer/notification.js";
import { LecturePlanGenerator } from "./lecture-plan-generator.js";

export class LecturePlanModal {
    static async show(plan) {
        return new Promise((resolve) => {
            const backdrop = document.createElement("div");
            backdrop.className = "modal";
            backdrop.innerHTML = `
                <div class="modal__overlay"></div>
                <div class="modal__dialog lecture-plan-modal">
                    <div class="modal__header">
                        <div>
                            <h2 class="modal__title">Review Lecture Plan</h2>
                            <div class="lecture-plan-modal__subtitle">Edit timing and section intent before generating the deck.</div>
                        </div>
                        <button class="modal__close" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal__body lecture-plan-modal__body">
                        <div class="lecture-plan-modal__summary">
                            <div class="lecture-plan-modal__metric">
                                <span class="lecture-plan-modal__metric-label">Topic</span>
                                <strong>${this.escapeHtml(plan.title || plan.topic || "Lecture")}</strong>
                            </div>
                            <div class="lecture-plan-modal__metric">
                                <span class="lecture-plan-modal__metric-label">Target Minutes</span>
                                <strong id="planTargetMinutes">${plan.totalMinutes}</strong>
                            </div>
                            <div class="lecture-plan-modal__metric">
                                <span class="lecture-plan-modal__metric-label">Allocated</span>
                                <strong id="planAllocatedMinutes">${LecturePlanGenerator.sumMinutes(plan.rows)}</strong>
                            </div>
                            <div class="lecture-plan-modal__metric">
                                <span class="lecture-plan-modal__metric-label">Break Rows</span>
                                <strong id="planBreakCount">${plan.rows.filter(row => row.type === "break").length}</strong>
                            </div>
                            <div class="lecture-plan-modal__metric">
                                <span class="lecture-plan-modal__metric-label">Activity Slides</span>
                                <strong>${plan.activityCount || 0}</strong>
                            </div>
                        </div>
                        <div class="lecture-plan-modal__notice">
                            Break rows stay in the lecture plan only. They shape pacing, while activity slides are added later from the separate activity count control.
                        </div>
                        <div class="lecture-plan-modal__validation" id="planValidation"></div>
                        <div class="lecture-plan-modal__table-wrap">
                            <table class="lecture-plan-modal__table">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Type</th>
                                        <th>Section</th>
                                        <th>Minutes</th>
                                        <th>Slides</th>
                                        <th>Notes / Teaching Goal</th>
                                    </tr>
                                </thead>
                                <tbody id="planRows">
                                    ${plan.rows.map((row, index) => this.renderRow(row, index)).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="lecture-plan-modal__footer">
                        <button type="button" class="course-profile-modal__btn course-profile-modal__btn--secondary" id="cancelBtn">Cancel</button>
                        <button type="button" class="course-profile-modal__btn course-profile-modal__btn--primary" id="generateBtn">Generate Deck</button>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const rowsBody = backdrop.querySelector("#planRows");
            const validationEl = backdrop.querySelector("#planValidation");
            const allocatedEl = backdrop.querySelector("#planAllocatedMinutes");
            const breakCountEl = backdrop.querySelector("#planBreakCount");
            const generateBtn = backdrop.querySelector("#generateBtn");
            const cancelBtn = backdrop.querySelector("#cancelBtn");
            const closeBtn = backdrop.querySelector(".modal__close");
            const overlay = backdrop.querySelector(".modal__overlay");

            const cleanup = () => {
                backdrop.classList.add("hide");
                setTimeout(() => backdrop.remove(), 200);
            };

            const collectPlan = () => ({
                ...plan,
                rows: Array.from(rowsBody.querySelectorAll("tr")).map((rowEl, index) => ({
                    id: rowEl.dataset.rowId || `plan-row-${index + 1}`,
                    type: rowEl.dataset.rowType,
                    title: rowEl.querySelector("[data-field='title']").value.trim(),
                    durationMinutes: Math.max(1, parseInt(rowEl.querySelector("[data-field='duration']").value, 10) || 0),
                    targetSlides: Math.max(0, parseInt(rowEl.querySelector("[data-field='slides']").value, 10) || 0),
                    notes: rowEl.querySelector("[data-field='notes']").value.trim()
                }))
            });

            const renderValidation = () => {
                const currentPlan = collectPlan();
                const validation = LecturePlanGenerator.validatePlan(currentPlan, {
                    totalMinutes: plan.totalMinutes,
                    breakCount: plan.breakCount
                });

                allocatedEl.textContent = String(validation.allocatedMinutes);
                breakCountEl.textContent = String(validation.actualBreaks);
                generateBtn.disabled = !validation.valid;

                if (validation.valid && validation.warnings.length === 0) {
                    validationEl.className = "lecture-plan-modal__validation lecture-plan-modal__validation--valid";
                    validationEl.textContent = "Plan timing is balanced and ready for deck generation.";
                } else if (!validation.valid) {
                    validationEl.className = "lecture-plan-modal__validation lecture-plan-modal__validation--error";
                    validationEl.textContent = validation.errors.join(" ");
                } else {
                    validationEl.className = "lecture-plan-modal__validation lecture-plan-modal__validation--warning";
                    validationEl.textContent = validation.warnings.join(" ");
                }
            };

            const updateOrderControls = () => {
                Array.from(rowsBody.querySelectorAll("tr")).forEach((rowEl, index, rows) => {
                    const numberEl = rowEl.querySelector("[data-role='order-number']");
                    const upBtn = rowEl.querySelector("[data-action='move-up']");
                    const downBtn = rowEl.querySelector("[data-action='move-down']");
                    if (numberEl) numberEl.textContent = String(index + 1);
                    if (upBtn) upBtn.disabled = index === 0;
                    if (downBtn) downBtn.disabled = index === rows.length - 1;
                });
            };

            rowsBody.addEventListener("input", renderValidation);

            rowsBody.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-action]");
                if (!button) return;

                const rowEl = button.closest("tr");
                if (!rowEl) return;

                if (button.dataset.action === "move-up" && rowEl.previousElementSibling) {
                    rowsBody.insertBefore(rowEl, rowEl.previousElementSibling);
                }

                if (button.dataset.action === "move-down" && rowEl.nextElementSibling) {
                    rowsBody.insertBefore(rowEl.nextElementSibling, rowEl);
                }

                updateOrderControls();
                renderValidation();
            });

            function removeEscapeListener() {
                document.removeEventListener("keydown", onEscape);
            }

            generateBtn.onclick = () => {
                const approvedPlan = collectPlan();
                const validation = LecturePlanGenerator.validatePlan(approvedPlan, {
                    totalMinutes: plan.totalMinutes,
                    breakCount: plan.breakCount
                });

                if (!validation.valid) {
                    Notification.error(validation.errors.join(" | "));
                    renderValidation();
                    return;
                }

                removeEscapeListener();
                cleanup();
                resolve(approvedPlan);
            };

            const close = () => {
                removeEscapeListener();
                cleanup();
                resolve(null);
            };

            cancelBtn.onclick = close;
            closeBtn.onclick = close;
            overlay.onclick = close;

            const onEscape = (event) => {
                if (event.key === "Escape") {
                    close();
                }
            };
            document.addEventListener("keydown", onEscape);

            updateOrderControls();
            renderValidation();
        });
    }

    static renderRow(row, index) {
        return `
            <tr data-row-id="${this.escapeHtml(row.id || `plan-row-${index + 1}`)}" data-row-type="${this.escapeHtml(row.type)}">
                <td>
                    <div class="lecture-plan-modal__order">
                        <span class="lecture-plan-modal__order-number" data-role="order-number">${index + 1}</span>
                        <div class="lecture-plan-modal__order-actions">
                            <button type="button" class="lecture-plan-modal__icon-btn" data-action="move-up" aria-label="Move row up">↑</button>
                            <button type="button" class="lecture-plan-modal__icon-btn" data-action="move-down" aria-label="Move row down">↓</button>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="lecture-plan-modal__type lecture-plan-modal__type--${this.escapeHtml(row.type)}">${this.escapeHtml(this.getTypeLabel(row.type))}</span>
                </td>
                <td>
                    <input class="course-profile-modal__input lecture-plan-modal__input" data-field="title" value="${this.escapeHtml(row.title)}" />
                </td>
                <td>
                    <input type="number" min="1" class="course-profile-modal__input lecture-plan-modal__minutes" data-field="duration" value="${this.escapeHtml(String(row.durationMinutes))}" />
                </td>
                <td>
                    <input type="number" min="0" class="course-profile-modal__input lecture-plan-modal__slides" data-field="slides" value="${this.escapeHtml(String(row.targetSlides ?? 0))}" ${row.type === "break" ? "disabled" : ""} />
                </td>
                <td>
                    <textarea class="course-profile-modal__textarea lecture-plan-modal__notes" rows="2" data-field="notes" placeholder="Why this section exists or what students should get from it">${this.escapeHtml(row.notes || "")}</textarea>
                </td>
            </tr>
        `;
    }

    static getTypeLabel(type) {
        switch (type) {
            case "intro":
                return "Intro";
            case "concept":
                return "Concept";
            case "break":
                return "Break";
            case "summary":
                return "Summary";
            default:
                return "Section";
        }
    }

    static escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}