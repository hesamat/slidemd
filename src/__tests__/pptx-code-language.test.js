import { describe, it, expect, beforeAll } from "vitest";
import {
  CODE_LANGUAGES,
  detectCodeLanguage,
  applyCodeLanguages,
} from "../data/pptx-code-language.js";

/** The highlight.js instance `applyCodeLanguages` uses, loaded once so the
 * sync `detectCodeLanguage` can be tested with the fallback enabled. */
let hljs = null;

beforeAll(async () => {
  // Import through the same dynamic path the module caches.
  const { default: core } = await import("highlight.js/lib/core");
  const ids = [
    "python",
    "javascript",
    "typescript",
    "java",
    "cpp",
    "xml",
    "css",
    "sql",
    "bash",
    "json",
  ];
  const langs = await Promise.all(ids.map((id) => import(`highlight.js/lib/languages/${id}`)));
  ids.forEach((id, i) => core.registerLanguage(id, langs[i].default));
  hljs = core;
});

describe("detectCodeLanguage", () => {
  it("supports the same language set as the import modal", () => {
    expect(CODE_LANGUAGES).toEqual([
      "javascript",
      "python",
      "java",
      "cpp",
      "html",
      "css",
      "sql",
      "bash",
      "json",
      "typescript",
    ]);
  });

  it("detects Python REPL transcripts via the decisive shortcut", () => {
    const code = ">>> d = {}\n>>> d['k'] = 99.9\n>>> d";
    expect(detectCodeLanguage(code, hljs)).toBe("python");
  });

  it("detects Python by def/import signatures", () => {
    const code = "def total(items):\n    return sum(items)\n\nimport math";
    expect(detectCodeLanguage(code, hljs)).toBe("python");
  });

  it("detects JSON only when it parses", () => {
    expect(detectCodeLanguage('{"name": "week06", "slides": [1, 2], "ok": true}', hljs)).toBe(
      "json",
    );
    // A Java object literal opening is NOT json — must fall through.
    expect(detectCodeLanguage('{ System.out.println("x"); }', hljs)).not.toBe("json");
  });

  it("detects Java idioms highlight.js mistakes for TypeScript", () => {
    const code =
      'public class Main {\n  public static void main(String[] a) {\n    System.out.println("hi");\n  }\n}';
    expect(detectCodeLanguage(code, hljs)).toBe("java");
  });

  it("detects JavaScript, SQL, bash, HTML, CSS, and C++ snippets", () => {
    expect(
      detectCodeLanguage(
        "const x = 5;\nfunction add(a, b) { return a + b; }\nconsole.log(add(1, 2));",
        hljs,
      ),
    ).toBe("javascript");
    expect(
      detectCodeLanguage("SELECT name, grade FROM students WHERE grade > 80 ORDER BY name;", hljs),
    ).toBe("sql");
    expect(detectCodeLanguage('#!/bin/bash\nfor f in *.txt; do\n  echo "$f"\ndone', hljs)).toBe(
      "bash",
    );
    expect(
      detectCodeLanguage("<!DOCTYPE html>\n<html>\n  <body><p>Hi</p></body>\n</html>", hljs),
    ).toBe("html");
    expect(detectCodeLanguage(".slide {\n  background: #fff;\n  padding: 10px;\n}", hljs)).toBe(
      "css",
    );
    // Regression: real COMP1510 blocks. A Python dict literal is NOT css (its
    // quoted keys look like declarations), and colon-terminated control flow
    // tags python even without def/import/print.
    const dictLiteral =
      "capitals = {\n    'Canada': 'Ottawa',\n    'France': 'Paris',\n    'Japan': 'Tokyo'\n}";
    expect(detectCodeLanguage(dictLiteral, hljs)).toBe("python");
    const dictLookup = 'grades_keanu = [98, 90, 43]\nstudent_summary = {"keanu": grades_keanu}';
    expect(detectCodeLanguage(dictLookup, hljs)).toBe("python");
    const controlFlow =
      "new_list = []\nfor value in old_list:\n    if keep(value):\n        new_list.append(value)";
    expect(detectCodeLanguage(controlFlow, hljs)).toBe("python");
    // Regression: an inline comment after the colon must not break the
    // control-line signal.
    const commentedBranch =
      "    if first >= second: # or >\n        max_value = first\n    else:\n        max_value = second";
    expect(detectCodeLanguage(commentedBranch, hljs)).toBe("python");
    expect(
      detectCodeLanguage(
        '#include <iostream>\nint main() {\n  std::cout << "hi";\n  return 0;\n}',
        hljs,
      ),
    ).toBe("cpp");
  });

  it("detects TypeScript only through type-level idioms", () => {
    const ts =
      'interface User { name: string; age: number }\nconst u: User = { name: "a", age: 1 };';
    expect(detectCodeLanguage(ts, hljs)).toBe("typescript");
  });

  it("returns an empty string for prose and garbage instead of guessing", () => {
    // highlight.js scores prose as low-relevance SQL — the floor must reject it.
    expect(detectCodeLanguage("These are some words without any particular structure.", hljs)).toBe(
      "",
    );
    expect(detectCodeLanguage("SELECT", hljs)).toBe("");
    expect(detectCodeLanguage("", hljs)).toBe("");
    expect(detectCodeLanguage("   \n  ", hljs)).toBe("");
    // Regression: comment-only blocks must not reach the python floor via the
    // capped comment signal (two weight-1 hits used to clear it).
    expect(detectCodeLanguage("# TODO fix this\n# TODO also that", hljs)).toBe("");
  });

  it("still detects via signatures without a highlight.js instance", () => {
    expect(detectCodeLanguage(">>> print('hi')")).toBe("python");
    expect(detectCodeLanguage('System.out.println("x");')).toBe("java");
  });
});

describe("applyCodeLanguages", () => {
  const md = [
    "```",
    "greeting = 'hello world'",
    "print(greeting)  # unchanged",
    "```",
    "",
    "@main",
    "",
    "- text",
  ].join("\n");

  it("tags the opening fence in auto mode and leaves closing fences bare", async () => {
    const result = await applyCodeLanguages(md, "auto");
    expect(result.split("\n")[0]).toBe("```python");
    expect(result.split("\n")[3]).toBe("```");
  });

  it("forces the explicit language onto every block", async () => {
    const result = await applyCodeLanguages(md, "python");
    expect(result.split("\n")[0]).toBe("```python");
    expect(result.split("\n")[3]).toBe("```");
  });

  it("detects blocks independently in auto mode", async () => {
    const multi = [
      "```",
      "SELECT name FROM students;",
      "```",
      "",
      "```",
      "const a = 1;",
      "```",
    ].join("\n");
    const result = await applyCodeLanguages(multi, "auto");
    expect(result).toContain("```sql\nSELECT name FROM students;");
    expect(result).toContain("```javascript\nconst a = 1;");
  });

  it("leaves unsure blocks untagged in auto mode", async () => {
    const unsure = ["```", "just some words", "```"].join("\n");
    expect(await applyCodeLanguages(unsure, "auto")).toBe(unsure);
  });

  it("strips existing tags in none mode", async () => {
    const tagged = "```python\nx = 1\n```";
    expect(await applyCodeLanguages(tagged, "none")).toBe("```\nx = 1\n```");
  });

  it("toggles fence state so a language string inside a block is not a new fence", async () => {
    // Only column-0 fence lines toggle; inline backticks in content are text.
    const inline = ["```", "const s = '```';", "```"].join("\n");
    const result = await applyCodeLanguages(inline, "auto");
    expect(result.split("\n")[0]).toBe("```javascript");
    expect(result.split("\n")[1]).toBe("const s = '```';");
  });

  it("tags an unclosed trailing fence in explicit mode", async () => {
    const unclosed = "```\nx = 1";
    expect(await applyCodeLanguages(unclosed, "python")).toBe("```python\nx = 1");
  });

  it("preserves longer fence markers when tagging", async () => {
    // Non-converter markdown may use 4-backtick fences — rewriting must not
    // collapse them (it would break blocks whose content contains ```).
    const md = ["````", "x = 1", "````"].join("\n");
    expect(await applyCodeLanguages(md, "python")).toBe(["````python", "x = 1", "````"].join("\n"));
    expect(await applyCodeLanguages("````python\nx = 1\n````", "none")).toBe("````\nx = 1\n````");
  });

  it("handles markdown without any fences", async () => {
    expect(await applyCodeLanguages("# Just text\n- a", "auto")).toBe("# Just text\n- a");
  });
});
