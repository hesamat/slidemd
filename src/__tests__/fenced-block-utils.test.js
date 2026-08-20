import { describe, it, expect } from "vitest";
import {
  parseFencedBlocks,
  parseFencedBlocksInArea,
  getAreaContentRange,
  findFencedBlockAtOpeningLine,
  removeFencedBlock,
  insertFencedBlockAt,
  moveFencedBlock,
  reorderFencedBlock,
  findAreaNameForOffset,
} from "../editor/codeblock/fenced-block-utils.js";

describe("parseFencedBlocks", () => {
  it("finds a single fenced block", () => {
    const md = "```js\nconsole.log('hi');\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("js");
    expect(blocks[0].isMermaid).toBe(false);
    expect(blocks[0].fullTag).toBe("```js\nconsole.log('hi');\n```");
    expect(blocks[0].start).toBe(0);
  });

  it("finds mermaid blocks and marks isMermaid", () => {
    const md = "```mermaid\nflowchart TD\n  A --> B\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].isMermaid).toBe(true);
    expect(blocks[0].lang).toBe("mermaid");
  });

  it("finds multiple blocks separated by prose", () => {
    const md = "Some text\n\n```js\ncode1\n```\n\nMore text\n\n```python\ncode2\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].lang).toBe("js");
    expect(blocks[1].lang).toBe("python");
    expect(blocks[1].start).toBeGreaterThan(blocks[0].end);
  });

  it("handles tilde fences", () => {
    const md = "~~~js\ncode\n~~~";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("js");
    expect(blocks[0].fenceMarker).toBe("~~~");
  });

  it("does not close a backtick fence with a tilde fence", () => {
    const md = "```js\ncode\n~~~\nmore\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe("```js\ncode\n~~~\nmore\n```");
  });

  it("handles info strings with attributes", () => {
    const md = "```js { center }\ncode\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("js");
    // The info string is the full text after the fence marker (CommonMark).
    expect(blocks[0].infoString).toBe("js { center }");
  });

  it("handles empty info string", () => {
    const md = "```\ncode\n```";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe("");
    expect(blocks[0].infoString).toBe("");
  });

  it("treats unterminated fence as ending at EOF", () => {
    const md = "```js\ncode without close";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fullTag).toBe(md);
  });

  it("end offset points after the closing fence newline", () => {
    const md = "```js\ncode\n```\ntrailing";
    const blocks = parseFencedBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(md.slice(blocks[0].end)).toBe("trailing");
  });
});

describe("getAreaContentRange", () => {
  it("returns range for @main area", () => {
    const md = "@main\ncontent here\n@media\nimage";
    const range = getAreaContentRange(md, "main");
    expect(md.slice(range.from, range.to)).toBe("content here\n");
  });

  it("returns range for @media area", () => {
    const md = "@main\ncontent\n@media\nimage here";
    const range = getAreaContentRange(md, "media");
    expect(md.slice(range.from, range.to)).toBe("image here");
  });

  it("returns empty range when area not found", () => {
    const md = "@main\ncontent";
    const range = getAreaContentRange(md, "nonexistent");
    expect(range.from).toBe(range.to);
  });
});

describe("parseFencedBlocksInArea", () => {
  it("returns only blocks in the named area", () => {
    const md = "@main\n```js\nmain code\n```\n\n@media\n```python\nmedia code\n```";
    const mainBlocks = parseFencedBlocksInArea(md, "main");
    const mediaBlocks = parseFencedBlocksInArea(md, "media");
    expect(mainBlocks).toHaveLength(1);
    expect(mainBlocks[0].lang).toBe("js");
    expect(mediaBlocks).toHaveLength(1);
    expect(mediaBlocks[0].lang).toBe("python");
  });
});

describe("findFencedBlockAtOpeningLine", () => {
  it("finds block by its opening fence line within the area", () => {
    const md = "@main\nIntro text\n\n```mermaid\nflowchart TD\n  A --> B\n```";
    // Area content lines (0-indexed): 0="Intro text", 1="", 2="```mermaid"
    const block = findFencedBlockAtOpeningLine(md, "main", 2);
    expect(block).not.toBeNull();
    expect(block.isMermaid).toBe(true);
  });

  it("returns null when no block at that line", () => {
    const md = "@main\n```js\ncode\n```";
    // Line 1 is "code" (inside the block but not its opening fence line)
    const block = findFencedBlockAtOpeningLine(md, "main", 1);
    expect(block).toBeNull();
  });
});

describe("removeFencedBlock", () => {
  it("removes the block and collapses extra newlines", () => {
    const md = "before\n\n```js\ncode\n```\n\nafter";
    const blocks = parseFencedBlocks(md);
    const { markdown, removed } = removeFencedBlock(md, blocks[0]);
    // fullTag includes the trailing newline after the closing fence
    expect(removed).toBe("```js\ncode\n```\n");
    expect(markdown).toBe("before\n\nafter");
  });

  it("collapses runs of 3+ newlines", () => {
    const md = "a\n\n\n```js\ncode\n```\n\n\nb";
    const blocks = parseFencedBlocks(md);
    const { markdown } = removeFencedBlock(md, blocks[0]);
    expect(markdown).not.toMatch(/\n{3,}/);
  });
});

describe("insertFencedBlockAt", () => {
  it("inserts with blank-line padding at end of area", () => {
    const md = "@main\nexisting text";
    const blockText = "```js\ncode\n```";
    const result = insertFencedBlockAt(md, md.length, blockText);
    expect(result).toContain(blockText);
    expect(result).toContain("existing text");
  });

  it("inserts with leading newline when needed", () => {
    const md = "@main\ntext";
    const blockText = "```js\ncode\n```";
    const result = insertFencedBlockAt(md, "@main\n".length + 4, blockText);
    expect(result).toContain("\n\n```js");
  });
});

describe("moveFencedBlock", () => {
  it("moves a block from main to media area", () => {
    const md = "@main\n```mermaid\nflowchart TD\n  A --> B\n```\n\n@media\nimage text";
    const blocks = parseFencedBlocks(md);
    const result = moveFencedBlock(md, blocks[0], "media");
    expect(result).not.toBeNull();
    // Block should no longer be in main
    const mainBlocks = parseFencedBlocksInArea(result, "main");
    expect(mainBlocks).toHaveLength(0);
    // Block should now be in media
    const mediaBlocks = parseFencedBlocksInArea(result, "media");
    expect(mediaBlocks).toHaveLength(1);
    expect(mediaBlocks[0].isMermaid).toBe(true);
  });

  it("preserves the block content exactly", () => {
    const md = "@main\n```mermaid\nflowchart TD\n  A --> B\n```\n\n@media\n";
    const blocks = parseFencedBlocks(md);
    const original = blocks[0].fullTag;
    const result = moveFencedBlock(md, blocks[0], "media");
    const movedBlocks = parseFencedBlocksInArea(result, "media");
    expect(movedBlocks[0].fullTag).toBe(original);
  });

  it("returns null when target area does not exist", () => {
    const md = "@main\n```js\ncode\n```";
    const blocks = parseFencedBlocks(md);
    const result = moveFencedBlock(md, blocks[0], "nonexistent");
    expect(result).toBeNull();
  });
});

describe("reorderFencedBlock", () => {
  it("reorders a block to the end of its area", () => {
    const md = "@main\n```js\nfirst\n```\n\nSome text";
    const blocks = parseFencedBlocks(md);
    // Move the code block to after "Some text" (end of area)
    const result = reorderFencedBlock(md, blocks[0], null);
    expect(result).not.toBeNull();
    const reordered = parseFencedBlocksInArea(result, "main");
    expect(reordered).toHaveLength(1);
    // The text should now come before the block
    const mainRange = getAreaContentRange(result, "main");
    const areaContent = result.slice(mainRange.from, mainRange.to);
    expect(areaContent.indexOf("Some text")).toBeLessThan(areaContent.indexOf("```js"));
  });
});

describe("findAreaNameForOffset", () => {
  it("returns the area name for an offset inside it", () => {
    const md = "@main\ncontent\n@media\nimage";
    const mainContentOffset = "@main\n".length;
    expect(findAreaNameForOffset(md, mainContentOffset)).toBe("main");
    const mediaContentOffset = "@main\ncontent\n@media\n".length;
    expect(findAreaNameForOffset(md, mediaContentOffset)).toBe("media");
  });

  it("returns null for offset before any area marker", () => {
    const md = "preamble\n@main\ncontent";
    expect(findAreaNameForOffset(md, 0)).toBeNull();
  });
});
