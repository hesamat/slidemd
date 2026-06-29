import { describe, it, expect } from "vitest";
import { PptxExtractor } from "../data/pptx-extractor.js";

describe("PptxExtractor.toPlainText", () => {
  it("converts slides with text elements to plain text", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "Introduction",
          notes: "Welcome everyone",
          elements: [
            { type: "text", content: "Hello World", left: 0, top: 0, width: 100, height: 50 },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
    expect(text).toContain("Title: Introduction");
    expect(text).toContain("Notes: Welcome everyone");
    expect(text).toContain("Hello World");
  });

  it("handles table elements", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "table",
              rows: [
                [{ text: "Name" }, { text: "Value" }],
                [{ text: "A" }, { text: "1" }],
              ],
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("Name | Value");
    expect(text).toContain("A | 1");
  });

  it("handles image elements", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "image",
              ref: "image1.png",
              base64: "abc",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("[Image: image1.png]");
  });

  it("handles empty slides", () => {
    const result = {
      slides: [{ index: 0, title: "", notes: "", elements: [], background: "" }],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
  });

  it("handles multiple slides", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "First",
          notes: "",
          elements: [{ type: "text", content: "A", left: 0, top: 0, width: 10, height: 10 }],
          background: "",
        },
        {
          index: 1,
          title: "Second",
          notes: "",
          elements: [{ type: "text", content: "B", left: 0, top: 0, width: 10, height: 10 }],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("--- Slide 1 ---");
    expect(text).toContain("--- Slide 2 ---");
    expect(text).toContain("Title: First");
    expect(text).toContain("Title: Second");
  });

  it("includes chart and diagram placeholders", () => {
    const result = {
      slides: [
        {
          index: 0,
          title: "",
          notes: "",
          elements: [
            {
              type: "chart",
              content: "[Chart: barChart]",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
            {
              type: "diagram",
              content: "Step 1, Step 2",
              left: 0,
              top: 0,
              width: 100,
              height: 100,
            },
          ],
          background: "",
        },
      ],
      themeColors: [],
      usedFonts: [],
      size: { width: 914400, height: 5143500 },
      images: [],
    };
    const text = PptxExtractor.toPlainText(result);
    expect(text).toContain("[Chart: barChart]");
    expect(text).toContain("[Diagram: Step 1, Step 2]");
  });
});
