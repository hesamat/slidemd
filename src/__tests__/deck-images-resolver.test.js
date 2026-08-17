import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckImagesResolver } from "../editor/image/deck-images-resolver.js";

// Revoke blob URLs synchronously so deferred revocation doesn't keep the
// test process alive.
DeckImagesResolver._revokeDelayMs = 0;

describe("DeckImagesResolver directory images", () => {
  afterEach(() => {
    DeckImagesResolver.clearDirectoryHandle();
    vi.restoreAllMocks();
  });

  it("reads images from the registered deck folder", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
    const getFile = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    const getDirectoryHandle = vi.fn().mockResolvedValue({ getFileHandle });
    const directoryHandle = {
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle,
    };

    DeckImagesResolver.setDirectoryHandle(directoryHandle);

    await expect(DeckImagesResolver.resolvePreviewSrc("images/../image.png")).resolves.toBe(
      "blob:image",
    );
    expect(getFileHandle).toHaveBeenCalledWith("image.png");
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it("falls back to the dev-server URL without a directory handle", async () => {
    await expect(DeckImagesResolver.resolvePreviewSrc("images/image.png")).resolves.toMatch(
      /^\/images\/image\.png\?v=\d+$/,
    );
  });

  it("caches failed disk lookups so re-renders do not re-probe the filesystem", async () => {
    const getDirectoryHandle = vi
      .fn()
      .mockRejectedValue(new DOMException("not found", "NotFoundError"));
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle,
    });

    await DeckImagesResolver.resolvePreviewSrc("images/missing.png");
    await DeckImagesResolver.resolvePreviewSrc("images/missing.png");

    expect(getDirectoryHandle).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent lookups of the same image", async () => {
    const getFile = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn().mockResolvedValue({ getFileHandle }),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");

    const [a, b] = await Promise.all([
      DeckImagesResolver.resolvePreviewSrc("images/same.png"),
      DeckImagesResolver.resolvePreviewSrc("images/same.png"),
    ]);
    expect(a).toBe("blob:image");
    expect(b).toBe("blob:image");
    expect(getFileHandle).toHaveBeenCalledTimes(1);
  });

  it("does not cache permission failures so later renders retry", async () => {
    const queryPermission = vi.fn().mockResolvedValue("prompt");
    DeckImagesResolver.setDirectoryHandle({ queryPermission });

    await DeckImagesResolver.resolvePreviewSrc("images/x.png");
    await DeckImagesResolver.resolvePreviewSrc("images/x.png");

    expect(queryPermission).toHaveBeenCalledTimes(2);
  });

  it("skips folder reads for images outside the deck snapshot", async () => {
    const getDirectoryHandle = vi.fn();
    DeckImagesResolver.setDirectoryHandle(
      {
        queryPermission: vi.fn().mockResolvedValue("granted"),
        getDirectoryHandle,
      },
      ["images/original.png"],
    );

    const url = await DeckImagesResolver.resolvePreviewSrc("images/new.png");

    expect(url).toMatch(/^\/images\/new\.png\?v=\d+$/);
    expect(getDirectoryHandle).not.toHaveBeenCalled();
  });
});

describe("DeckImagesResolver checkMissingImageRefs", () => {
  afterEach(() => {
    DeckImagesResolver.clearDirectoryHandle();
    vi.restoreAllMocks();
  });

  it("returns empty when no directory handle is set", async () => {
    const missing = await DeckImagesResolver.checkMissingImageRefs("![alt](images/missing.png)");
    expect(missing).toEqual([]);
  });

  it("returns empty when markdown has no image refs", async () => {
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn().mockResolvedValue({
        getFileHandle: vi.fn().mockResolvedValue({
          getFile: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" })),
        }),
      }),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
    const missing = await DeckImagesResolver.checkMissingImageRefs("No images here");
    expect(missing).toEqual([]);
  });

  it("returns missing refs when the file is not found on disk", async () => {
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn().mockRejectedValue(new DOMException("not found", "NotFoundError")),
    });
    const missing = await DeckImagesResolver.checkMissingImageRefs(
      "![a](images/missing.png)\n![b](images/also-missing.jpg)",
    );
    expect(missing).toContain("images/missing.png");
    expect(missing).toContain("images/also-missing.jpg");
    expect(missing).toHaveLength(2);
  });

  it("returns empty when all images resolve from disk", async () => {
    const getFile = vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    const getFileHandle = vi.fn().mockResolvedValue({ getFile });
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle: vi.fn().mockResolvedValue({ getFileHandle }),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
    const missing = await DeckImagesResolver.checkMissingImageRefs("![a](images/found.png)");
    expect(missing).toEqual([]);
  });

  it("deduplicates refs that appear multiple times in the markdown", async () => {
    const getDirectoryHandle = vi
      .fn()
      .mockRejectedValue(new DOMException("not found", "NotFoundError"));
    DeckImagesResolver.setDirectoryHandle({
      queryPermission: vi.fn().mockResolvedValue("granted"),
      getDirectoryHandle,
    });
    const missing = await DeckImagesResolver.checkMissingImageRefs(
      "![a](images/dup.png)\n![b](images/dup.png)\n![c](images/dup.png)",
    );
    expect(missing).toEqual(["images/dup.png"]);
  });
});
