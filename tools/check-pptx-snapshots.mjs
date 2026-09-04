#!/usr/bin/env node
/**
 * Headless-Chromium PPTX import snapshot check (#291).
 *
 * Batch-converts the synthetic fixture corpus (src/__tests__/fixtures/pptx)
 * through the real pptx-import.mjs CLI and diffs the resulting deck markdown
 * against the pinned expectations in src/__tests__/fixtures/pptx-expected.
 *
 * Unlike the jsdom snapshot test (pptx-import-snapshots.test.js), this runs
 * the full-fidelity path: diagram shape-groups render to PNG crops, so the
 * diagram-bearing fixtures pin the *cropped* output, not the degraded
 * `[Diagram: ...]` markers.
 *
 * Usage:
 *   node tools/check-pptx-snapshots.mjs            # diff (exit 1 on change)
 *   node tools/check-pptx-snapshots.mjs --update   # review diff, then re-pin
 *
 * Requires: npx playwright install chromium
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(path.dirname(import.meta.url)), "..");
const FIXTURES_DIR = path.join(projectRoot, "src", "__tests__", "fixtures", "pptx");
const EXPECTED_DIR = path.join(projectRoot, "src", "__tests__", "fixtures", "pptx-expected", "headless");
const WORK_DIR = path.join(projectRoot, ".pptx-snapshot-work");

const update = process.argv.includes("--update");
const fixtures = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.toLowerCase().endsWith(".pptx") && !f.startsWith("~$"))
  .sort();

fs.rmSync(WORK_DIR, { recursive: true, force: true });

console.log(`Converting ${fixtures.length} fixture decks via tools/pptx-import.mjs ...`);
const result = spawnSync(
  "node",
  [path.join(projectRoot, "tools", "pptx-import.mjs"), FIXTURES_DIR, "--out", WORK_DIR],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("pptx-import.mjs failed — see output above.");
  process.exit(1);
}

let failures = 0;
for (const name of fixtures) {
  const deckName = name.replace(/\.pptx$/i, "");
  const actualPath = path.join(WORK_DIR, deckName, `${deckName}.md`);
  const expectedPath = path.join(EXPECTED_DIR, `${name}.md`);
  if (!fs.existsSync(actualPath)) {
    console.error(`MISSING output for ${name} (conversion produced no markdown)`);
    failures++;
    continue;
  }
  const actual = fs.readFileSync(actualPath, "utf8");
  if (update) {
    fs.mkdirSync(EXPECTED_DIR, { recursive: true });
    fs.copyFileSync(actualPath, expectedPath);
    console.log(`updated ${path.relative(projectRoot, expectedPath)}`);
    continue;
  }
  if (!fs.existsSync(expectedPath)) {
    console.error(`MISSING expectation ${expectedPath} — run with --update to pin it`);
    failures++;
    continue;
  }
  const expected = fs.readFileSync(expectedPath, "utf8");
  if (actual !== expected) {
    const i = [...actual].findIndex((ch, j) => ch !== expected[j]);
    console.error(
      `DIFF in ${name} at char ${i === -1 ? expected.length : i}\n` +
        `  expected: ${JSON.stringify(expected.slice(Math.max(0, i - 40), i + 40))}\n` +
        `  actual:   ${JSON.stringify(actual.slice(Math.max(0, i - 40), i + 40))}`,
    );
    failures++;
  } else {
    console.log(`ok ${name}`);
  }
}

fs.rmSync(WORK_DIR, { recursive: true, force: true });

if (update) {
  console.log("\nSnapshots updated. Review the diff, then commit it together with the change.");
} else if (failures > 0) {
  console.error(`\n${failures}/${fixtures.length} snapshot(s) differ. If the change is intended, run:\n` +
    `  node tools/check-pptx-snapshots.mjs --update`);
  process.exit(1);
} else {
  console.log(`\nAll ${fixtures.length} PPTX import snapshots match.`);
}
