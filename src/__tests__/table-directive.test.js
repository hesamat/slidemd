import { describe, it, expect } from "vitest";
import {
  parseTableDirectives,
  buildTableDirective,
  convertTableDirectivesToMarkers,
  parseTableDirectiveAttrs,
  CANONICAL_TABLE_ATTRIBUTES,
  KNOWN_TABLE_ATTRIBUTES,
} from "../core/table-directive.js";

describe("table-directive parsing", () => {
  it("parses a container directive with all supported attributes", () => {
    const md = [
      '::: table { width=60 align=center fontSize=24 columns=2,1,3 borders=false striped=false headerColor="#003C68" no-header }',
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      ":::",
    ].join("\n");
    const [parsed] = parseTableDirectives(md);
    expect(parsed).toBeDefined();
    expect(parsed.settings).toMatchObject({
      width: 60,
      align: "center",
      fontSize: 24,
      columns: [2, 1, 3],
      borders: false,
      striped: false,
      headerColor: "#003c68",
      noHeader: true,
    });
    expect(parsed.content).toContain("| A | B |");
    expect(parsed.unknownAttrs).toEqual([]);
  });

  it("parses unquoted headerColor hex values", () => {
    const md = "::: table { headerColor=#003C68 }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.headerColor).toBe("#003c68");
  });

  it("rejects unsafe headerColor values", () => {
    const md = '::: table { headerColor="javascript:alert(1)" }\n| A |\n| --- |\n| 1 |\n:::';
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.headerColor).toBeNull();
  });

  it("parses bare flag no-header as true", () => {
    const md = "::: table { no-header }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.noHeader).toBe(true);
  });

  it("clamps width to 1–100", () => {
    const md = "::: table { width=150 }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.width).toBe(100);
  });

  it("rejects invalid align values", () => {
    const md = "::: table { align=justify }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.align).toBeNull();
  });

  it("records unknown attributes without dropping them", () => {
    const md = "::: table { width=50 style=bold padding=10 }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.width).toBe(50);
    expect(parsed.unknownAttrs).toContain("style");
    expect(parsed.unknownAttrs).toContain("padding");
  });

  it("records colon-style declarations as unknown", () => {
    const md = "::: table { width: 50% }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    // width: 50% is colon-style — recorded as unknown, not parsed as width
    expect(parsed.unknownAttrs).toContain("width");
    expect(parsed.settings.width).toBeNull();
  });

  it("parses multiple directives in one string", () => {
    const md = [
      "::: table { width=40 }",
      "| A |",
      "| --- |",
      "| 1 |",
      ":::",
      "",
      "::: table { width=75 }",
      "| B |",
      "| --- |",
      "| 2 |",
      ":::",
    ].join("\n");
    const blocks = parseTableDirectives(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].settings.width).toBe(40);
    expect(blocks[1].settings.width).toBe(75);
  });

  it("returns empty array when no directives present", () => {
    expect(parseTableDirectives("| A |\n| --- |\n| 1 |")).toEqual([]);
  });

  it("exports a curated canonical list", () => {
    expect(CANONICAL_TABLE_ATTRIBUTES).toContain("width");
    expect(CANONICAL_TABLE_ATTRIBUTES).toContain("no-header");
    for (const attr of CANONICAL_TABLE_ATTRIBUTES) {
      expect(KNOWN_TABLE_ATTRIBUTES.has(attr.toLowerCase())).toBe(true);
    }
  });

  it("parses attribute keys case-insensitively", () => {
    const md =
      "::: table { Width=60 ALIGN=left FontSize=24 HeaderColor=#003C68 }\n| A |\n| --- |\n| 1 |\n:::";
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.width).toBe(60);
    expect(parsed.settings.align).toBe("left");
    expect(parsed.settings.fontSize).toBe(24);
    expect(parsed.settings.headerColor).toBe("#003c68");
    expect(parsed.unknownAttrs).toEqual([]);
  });

  it("parses quoted headerColor with rgb() containing spaces", () => {
    const md = '::: table { headerColor="rgb(0, 60, 100)" }\n| A |\n| --- |\n| 1 |\n:::';
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.headerColor).toBe("rgb(0, 60, 100)");
  });

  it("parses quoted columns with spaces after commas", () => {
    const md =
      '::: table { columns="2, 1, 3" }\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n:::';
    const [parsed] = parseTableDirectives(md);
    expect(parsed.settings.columns).toEqual([2, 1, 3]);
  });
});

describe("buildTableDirective", () => {
  it("builds a directive with all attributes", () => {
    const directive = buildTableDirective(
      {
        width: 60,
        align: "center",
        fontSize: 24,
        columns: [2, 1, 3],
        borders: false,
        striped: false,
        headerColor: "#003c68",
        noHeader: true,
      },
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
    expect(directive).toContain(
      '::: table { width=60 align=center fontSize=24 columns=2,1,3 borders=false striped=false headerColor="#003c68" no-header }',
    );
    expect(directive).toContain("| A | B |");
    expect(directive).toContain(":::");
  });

  it("omits null/default attributes", () => {
    const directive = buildTableDirective({ width: 50 }, "| A |\n| --- |\n| 1 |");
    expect(directive).toBe("::: table { width=50 }\n| A |\n| --- |\n| 1 |\n:::");
  });

  it("emits empty braces when no attributes", () => {
    const directive = buildTableDirective({}, "| A |\n| --- |\n| 1 |");
    expect(directive).toContain("::: table { }");
  });
});

describe("convertTableDirectivesToMarkers", () => {
  it("converts a container to a single-line marker", () => {
    const md = [
      "::: table { width=60 align=center }",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      ":::",
    ].join("\n");
    const result = convertTableDirectivesToMarkers(md);
    expect(result).toContain("table {width=60 align=center}");
    expect(result).toContain("| A | B |");
    expect(result).not.toContain("::: table");
    expect(result).not.toContain(":::");
  });

  it("emits no marker when the container has no attributes", () => {
    const md = "::: table { }\n| A |\n| --- |\n| 1 |\n:::";
    const result = convertTableDirectivesToMarkers(md);
    expect(result).not.toContain("table {");
    expect(result).toContain("| A |");
  });

  it("leaves markdown without directives untouched", () => {
    const md = "| A |\n| --- |\n| 1 |";
    expect(convertTableDirectivesToMarkers(md)).toBe(md);
  });

  it("handles multiple directives", () => {
    const md = [
      "::: table { width=40 }",
      "| A |",
      "| --- |",
      "| 1 |",
      ":::",
      "",
      "::: table { width=75 no-header }",
      "| B |",
      "| --- |",
      "| 2 |",
      ":::",
    ].join("\n");
    const result = convertTableDirectivesToMarkers(md);
    expect(result).toContain("table {width=40}");
    expect(result).toContain("table {width=75 no-header}");
    expect(result).not.toContain(":::");
  });

  it("quotes headerColor values containing spaces in the marker", () => {
    const md = '::: table { headerColor="rgb(0, 60, 100)" }\n| A |\n| --- |\n| 1 |\n:::';
    const result = convertTableDirectivesToMarkers(md);
    expect(result).toContain('headerColor="rgb(0, 60, 100)"');
  });

  it("does not quote hex headerColor values in the marker", () => {
    const md = "::: table { headerColor=#003C68 }\n| A |\n| --- |\n| 1 |\n:::";
    const result = convertTableDirectivesToMarkers(md);
    expect(result).toContain("headerColor=#003c68");
    expect(result).not.toContain('headerColor="');
  });
});

describe("parseTableDirectiveAttrs (marker tokenizer)", () => {
  it("parses quoted values with spaces (rgb color)", () => {
    const meta = parseTableDirectiveAttrs('width=60 headerColor="rgb(0, 60, 100)"');
    expect(meta.tableWidth).toBe(60);
    expect(meta.tableHeaderColor).toBe("rgb(0, 60, 100)");
  });

  it("parses quoted columns with spaces", () => {
    const meta = parseTableDirectiveAttrs('columns="2, 1, 3"');
    expect(meta.tableColumns).toEqual([2, 1, 3]);
  });

  it("parses unquoted values without spaces normally", () => {
    const meta = parseTableDirectiveAttrs("width=60 align=center fontSize=24 columns=2,1,3");
    expect(meta.tableWidth).toBe(60);
    expect(meta.tableAlign).toBe("center");
    expect(meta.tableFontSize).toBe(24);
    expect(meta.tableColumns).toEqual([2, 1, 3]);
  });

  it("parses case-insensitive keys", () => {
    const meta = parseTableDirectiveAttrs("Width=60 FONTSIZE=24");
    expect(meta.tableWidth).toBe(60);
    expect(meta.tableFontSize).toBe(24);
  });

  it("returns null for empty input", () => {
    expect(parseTableDirectiveAttrs("")).toBeNull();
    expect(parseTableDirectiveAttrs(null)).toBeNull();
  });
});
