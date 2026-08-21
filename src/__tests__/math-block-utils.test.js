import { describe, it, expect } from "vitest";
import {
  parseAllDisplayMathBlocks,
  parseDisplayMathBlocksInArea,
  removeDisplayMathBlock,
  insertDisplayMathBlockAt,
} from "../editor/math/math-block-utils.js";

describe("parseAllDisplayMathBlocks", () => {
  it("finds $$...$$ display math on a single line", () => {
    const md = "Hello\n\n$$E = mc^2$$\n\nWorld";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("$$E = mc^2$$");
    expect(md.slice(blocks[0].start, blocks[0].end)).toBe("$$E = mc^2$$");
  });

  it("finds multi-line $$ display math", () => {
    const md = "Hello\n\n$$\nE = mc^2\n$$\n\nWorld";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("$$\nE = mc^2\n$$");
  });

  it("finds \\[...\\] display math", () => {
    const md = "Hello\n\n\\[ E = mc^2 \\]\n\nWorld";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("\\[ E = mc^2 \\]");
  });

  it("does not match inline $...$ math", () => {
    const md = "Hello $E = mc^2$ world";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(0);
  });

  it("finds multiple display math blocks", () => {
    const md = "$$A$$\n\n\\[B\\]";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].fullTag).toBe("$$A$$");
    expect(blocks[1].fullTag).toBe("\\[B\\]");
  });

  it("finds display math on a line with other text", () => {
    const md = "Block: $$\\int_a^b f(x) dx$$ more";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("$$\\int_a^b f(x) dx$$");
    expect(md.slice(blocks[0].start, blocks[0].end)).toBe("$$\\int_a^b f(x) dx$$");
  });

  it("skips display math inside fenced code blocks", () => {
    const md = "$$A$$\n\n```\n$$B$$\n```\n\n$$C$$";
    const blocks = parseAllDisplayMathBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].fullTag).toBe("$$A$$");
    expect(blocks[1].fullTag).toBe("$$C$$");
  });
});

describe("parseDisplayMathBlocksInArea", () => {
  const md = `Some intro

@main
$$E = mc^2$$

@media
\\[ F = ma \\]\n`;

  it("returns only blocks in @main", () => {
    const blocks = parseDisplayMathBlocksInArea(md, "main");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("$$E = mc^2$$");
  });

  it("returns only blocks in @media", () => {
    const blocks = parseDisplayMathBlocksInArea(md, "media");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("\\[ F = ma \\]");
  });
});

describe("removeDisplayMathBlock", () => {
  it("removes a block and collapses blank lines", () => {
    const md = "Before\n\n$$E = mc^2$$\n\nAfter";
    const blocks = parseAllDisplayMathBlocks(md);
    const { markdown: updated } = removeDisplayMathBlock(md, blocks[0]);
    expect(updated).toBe("Before\n\nAfter");
  });
});

describe("insertDisplayMathBlockAt", () => {
  it("inserts a block with surrounding blank lines", () => {
    const md = "Before\n\nAfter";
    const updated = insertDisplayMathBlockAt(md, 8, "$$E = mc^2$$");
    expect(updated).toContain("Before\n\n$$E = mc^2$$\n\nAfter");
  });
});
