/* globals Buffer, process */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readTextIfExists,
  toDataUri,
  resolveCssImports,
} from "../build-helpers.mjs";

/**
 * Security tests for the path traversal mitigation in build-helpers.mjs.
 *
 * These tests exercise the real implementations used by tools/build.mjs.
 */

describe("Path Traversal Security Tests", () => {
  let tempDir;
  let testFile;
  let testImage;
  let testCss;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-security-test-"));

    testFile = path.join(tempDir, "test.txt");
    fs.writeFileSync(testFile, "test content", "utf8");

    testImage = path.join(tempDir, "test.png");
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(testImage, pngData);

    testCss = path.join(tempDir, "test.css");
    fs.writeFileSync(testCss, "body { color: red; }", "utf8");
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("readTextIfExists - Path Traversal Protection", () => {
    it("should read a valid relative file path", () => {
      const content = readTextIfExists("test.txt", tempDir);
      expect(content).toBe("test content");
    });

    it("should read a valid absolute file path inside the allowed directory", () => {
      const content = readTextIfExists(testFile, tempDir);
      expect(content).toBe("test content");
    });

    it("should return empty string for a non-existent file", () => {
      const content = readTextIfExists("nonexistent.txt", tempDir);
      expect(content).toBe("");
    });

    it("should reject path traversal to an existing file", () => {
      const parentDir = path.dirname(tempDir);
      const sensitiveFile = path.join(parentDir, "sensitive.txt");
      fs.writeFileSync(sensitiveFile, "sensitive data", "utf8");

      try {
        expect(() => readTextIfExists(path.join(tempDir, "..", "sensitive.txt"), tempDir)).toThrow(
          "Invalid file path",
        );
      } finally {
        if (fs.existsSync(sensitiveFile)) {
          fs.unlinkSync(sensitiveFile);
        }
      }
    });

    it("should reject path traversal to an absolute file outside the allowed directory", () => {
      const parentDir = path.dirname(tempDir);
      const sensitiveFile = path.join(parentDir, "sensitive-absolute.txt");
      fs.writeFileSync(sensitiveFile, "sensitive data", "utf8");

      try {
        expect(() => readTextIfExists(sensitiveFile, tempDir)).toThrow("Invalid file path");
      } finally {
        if (fs.existsSync(sensitiveFile)) {
          fs.unlinkSync(sensitiveFile);
        }
      }
    });

    it("should return empty string for a non-existent traversal path", () => {
      const result = readTextIfExists("../../this-does-not-exist-12345.txt", tempDir);
      expect(result).toBe("");
    });

    it("should return empty string for a non-existent absolute path", () => {
      const result = readTextIfExists("C:\\Windows\\System32\\config\\sam", tempDir);
      expect(result).toBe("");
    });

    it("should return empty string for a non-existent mixed traversal path", () => {
      const result = readTextIfExists(
        "subdir/../../../this-does-not-exist-12345.txt",
        tempDir,
      );
      expect(result).toBe("");
    });

    it("should return empty string for a non-existent URL-encoded traversal attempt", () => {
      const result = readTextIfExists("..%2F..%2Fetc%2Fpasswd", tempDir);
      expect(result).toBe("");
    });
  });

  describe("toDataUri - Path Traversal Protection", () => {
    it("should convert a valid relative image to a data URI", () => {
      const dataUri = toDataUri("test.png", tempDir);
      expect(dataUri).toMatch(/^data:image\/png;base64,/);
    });

    it("should convert a valid absolute image inside the allowed directory", () => {
      const dataUri = toDataUri(testImage, tempDir);
      expect(dataUri).toMatch(/^data:image\/png;base64,/);
    });

    it("should return null for unsupported file types", () => {
      const dataUri = toDataUri("test.txt", tempDir);
      expect(dataUri).toBeNull();
    });

    it("should reject path traversal with ..", () => {
      const result = toDataUri("../sensitive/image.png", tempDir);
      expect(result).toBeNull();
    });

    it("should reject nested path traversal", () => {
      const result = toDataUri("../../etc/../var/image.png", tempDir);
      expect(result).toBeNull();
    });

    it("should reject absolute Unix paths outside the allowed directory", () => {
      const result = toDataUri("/var/www/image.png", tempDir);
      expect(result).toBeNull();
    });

    it("should reject absolute Windows paths outside the allowed directory", () => {
      const absolutePath =
        process.platform === "win32"
          ? "C:\\Users\\Public\\image.png"
          : "/tmp/image.png";

      const result = toDataUri(absolutePath, tempDir);
      expect(result).toBeNull();
    });
  });

  describe("resolveCssImports - Path Traversal Protection", () => {
    let cssWithImport;
    let importedCss;

    beforeEach(() => {
      importedCss = path.join(tempDir, "imported.css");
      fs.writeFileSync(importedCss, ".imported { color: blue; }", "utf8");

      cssWithImport = path.join(tempDir, "main.css");
      fs.writeFileSync(cssWithImport, '@import "imported.css";\n.main { color: red; }', "utf8");
    });

    it("should resolve valid CSS imports", () => {
      const result = resolveCssImports(cssWithImport);
      expect(result).toContain("/* @import imported.css */");
      expect(result).toContain(".imported { color: blue; }");
      expect(result).toContain(".main { color: red; }");
    });

    it("should not resolve imports with path traversal", () => {
      const maliciousCss = path.join(tempDir, "malicious.css");
      fs.writeFileSync(maliciousCss, '@import "../../../etc/passwd";\n.main { color: red; }', "utf8");

      const result = resolveCssImports(maliciousCss);
      expect(result).toContain('@import "../../../etc/passwd"');
      expect(result).toContain(".main { color: red; }");
      expect(result).not.toContain("root:");
    });

    it("should not resolve imports with absolute paths", () => {
      const maliciousCss = path.join(tempDir, "malicious2.css");
      fs.writeFileSync(maliciousCss, '@import "/etc/passwd";\n.main { color: red; }', "utf8");

      const result = resolveCssImports(maliciousCss);
      expect(result).toContain('@import "/etc/passwd"');
      expect(result).toContain(".main { color: red; }");
    });

    it("should allow remote CSS imports", () => {
      const remoteCss = path.join(tempDir, "remote.css");
      fs.writeFileSync(
        remoteCss,
        '@import "https://example.com/style.css";\n.main { color: red; }',
        "utf8",
      );

      const result = resolveCssImports(remoteCss);
      expect(result).toContain('@import "https://example.com/style.css"');
      expect(result).toContain(".main { color: red; }");
    });

    it("should not resolve imports attempting to escape the base directory", () => {
      const subDir = path.join(tempDir, "subdir");
      fs.mkdirSync(subDir);

      const maliciousCss = path.join(subDir, "escape.css");
      fs.writeFileSync(maliciousCss, '@import "../../sensitive.css";\n.main { color: red; }', "utf8");

      const result = resolveCssImports(maliciousCss);
      expect(result).toContain('@import "../../sensitive.css"');
    });
  });
});
