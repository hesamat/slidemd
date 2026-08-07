import { createEditPatch } from "./slide-patch.js";

const NOTES_PATTERN = "<!--\\s*notes\\s*:(.*?)-->";

/**
 * Split markdown into code-fence-aware segments.
 * @param {string} text
 * @returns {{ inFence: boolean, text: string }[]}
 */
function splitFenceAware(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const segments = [];
  const plainLines = [];
  let inFence = false;
  let fenceMarker = null;

  const flushPlain = () => {
    if (plainLines.length === 0) return;
    segments.push({ inFence: false, text: plainLines.join("\n") });
    plainLines.length = 0;
  };

  for (const line of lines) {
    const m = line.match(/^\s*(```+|~~~+)\s*/);

    if (!inFence && m) {
      flushPlain();
      inFence = true;
      fenceMarker = m[1][0];
      segments.push({ inFence: true, text: line });
      continue;
    }

    if (inFence) {
      segments.push({ inFence: true, text: line });
      if (m && m[1][0] === fenceMarker) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }

    plainLines.push(line);
  }

  flushPlain();
  return segments;
}

/**
 * Extract speaker notes from `<!-- notes: ... -->` comments outside code fences.
 * @param {string} markdown
 * @returns {string}
 */
function extractNotes(markdown) {
  const parts = [];
  for (const segment of splitFenceAware(markdown)) {
    if (segment.inFence) continue;
    const re = new RegExp(NOTES_PATTERN, "gis");
    const matches = [...segment.text.matchAll(re)];
    for (const match of matches) {
      parts.push(match[1].trim());
    }
  }
  return parts.join("\n\n").trim();
}

/**
 * Remove all `<!-- notes: ... -->` comments from markdown outside code fences.
 * @param {string} markdown
 * @returns {string}
 */
function stripNotes(markdown) {
  return splitFenceAware(markdown)
    .map((segment) =>
      segment.inFence ? segment.text : segment.text.replace(new RegExp(NOTES_PATTERN, "gis"), ""),
    )
    .join("\n");
}

/**
 * Build a canonical `<!-- notes: ... -->` comment from extracted notes text.
 * @param {string} notes
 * @returns {string}
 */
function formatNotesComment(notes) {
  return `<!-- notes: ${notes} -->`;
}

/**
 * Build a rebase patch for a notes intent.
 * @param {import("./slide-patch.js").SlidePatch} patch
 * @param {string} before
 * @param {string} baseSlideMarkdown
 * @param {string} notes
 * @returns {import("./slide-patch.js").SlidePatch}
 */
function buildNotesRebasePatch(patch, before, baseSlideMarkdown, notes) {
  const visible = stripNotes(baseSlideMarkdown).trim();
  const after = visible ? `${visible}\n\n${formatNotesComment(notes)}` : formatNotesComment(notes);
  return createEditPatch(patch.index, before, after, "ai", "rebase");
}

/**
 * Resolve a single-slide AI patch against the current working slide.
 * @param {object} params
 * @param {import("./slide-patch.js").SlidePatch} params.patch
 * @param {string} params.currentSlideMarkdown
 * @param {"enhanceSlide" | "addSpeakerNotes"} params.intent
 * @param {boolean} [params.structuralRevisionChanged]
 * @param {"reject" | "apply-to-latest" | "apply-to-original"} [params.rebase]
 * @returns {{ action: "apply" | "rebase" | "reject", reason?: string, rebasedPatch?: import("./slide-patch.js").SlidePatch }}
 */
export function resolveConflict({
  patch,
  currentSlideMarkdown,
  intent,
  structuralRevisionChanged = false,
  rebase,
}) {
  const current = currentSlideMarkdown ?? "";

  if (intent === "enhanceSlide") {
    return resolveEnhance(patch, current, rebase, structuralRevisionChanged);
  }

  if (intent === "addSpeakerNotes") {
    return resolveNotes(patch, current, rebase, structuralRevisionChanged);
  }

  return { action: "reject", reason: `Unsupported intent: ${intent}` };
}

function resolveEnhance(patch, current, rebase, structuralRevisionChanged) {
  if (current === patch.before) {
    return { action: "apply" };
  }

  if (rebase === "reject") {
    return { action: "reject", reason: "User chose to keep the current edits." };
  }

  if (rebase === "apply-to-latest") {
    return {
      action: "rebase",
      reason: "Rebase: apply the AI changes to the latest slide.",
      rebasedPatch: createEditPatch(patch.index, current, patch.after, "ai", "rebase"),
    };
  }

  if (rebase === "apply-to-original") {
    return {
      action: "rebase",
      reason: "Rebase: discard user edits and restore the original slide.",
      rebasedPatch: createEditPatch(patch.index, current, patch.before, "ai", "rebase"),
    };
  }

  if (structuralRevisionChanged) {
    return {
      action: "reject",
      reason:
        "The deck structure changed while the AI operation was in flight. The target slide may have moved or changed identity.",
    };
  }

  return {
    action: "reject",
    reason: "The slide has changed and no rebase choice was provided.",
  };
}

function resolveNotes(patch, current, rebase, structuralRevisionChanged) {
  if (structuralRevisionChanged) {
    return {
      action: "reject",
      reason:
        "The deck structure changed while the AI operation was in flight. The target slide may have moved or changed identity.",
    };
  }

  const aiNotes = extractNotes(patch.after);
  if (!aiNotes) {
    return { action: "reject", reason: "The AI result does not contain a speaker notes block." };
  }

  if (current === patch.before) {
    return { action: "apply" };
  }

  const visibleCurrent = stripNotes(current).trim();
  const visibleOriginal = stripNotes(patch.before).trim();

  if (visibleCurrent === visibleOriginal) {
    return {
      action: "rebase",
      reason: "Non-notes content matches; rebasing notes onto the latest slide.",
      rebasedPatch: buildNotesRebasePatch(patch, current, current, aiNotes),
    };
  }

  if (rebase === "reject") {
    return { action: "reject", reason: "User chose to keep the current edits." };
  }

  if (rebase === "apply-to-latest") {
    return {
      action: "rebase",
      reason: "Rebase: apply the AI notes to the latest slide.",
      rebasedPatch: buildNotesRebasePatch(patch, current, current, aiNotes),
    };
  }

  if (rebase === "apply-to-original") {
    return {
      action: "rebase",
      reason: "Rebase: apply the AI notes to the original slide.",
      rebasedPatch: buildNotesRebasePatch(patch, current, patch.before, aiNotes),
    };
  }

  return {
    action: "reject",
    reason: "The slide body has changed; a rebase choice is required.",
  };
}
