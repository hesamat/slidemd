import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckImagesResolver } from "../editor/image/deck-images-resolver.js";

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
});
