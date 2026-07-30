import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadImagesInBatches, UPLOAD_BATCH_MAX_FILES } from "../core/image-batch-uploader.js";

const makeEntry = (name, size = 1) => ({
  key: name,
  file: new File([new Uint8Array(size)], name, { type: "image/png" }),
});

/** Responds with a server path for every file in the request. */
const okResponder = () =>
  vi.fn(async (_url, { body }) => ({
    ok: true,
    json: async () => ({
      paths: body.getAll("image").map((f) => ({ name: f.name, path: `images/${f.name}` })),
    }),
  }));

describe("uploadImagesInBatches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty map without calling the server when there are no entries", async () => {
    const fetchMock = okResponder();
    vi.stubGlobal("fetch", fetchMock);
    const result = await uploadImagesInBatches([]);
    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one request for a small set and maps keys to server paths", async () => {
    const fetchMock = okResponder();
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadImagesInBatches([makeEntry("a.png"), makeEntry("b.png")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/upload-images");
    expect(Object.fromEntries(result)).toEqual({
      "a.png": "images/a.png",
      "b.png": "images/b.png",
    });
  });

  it("splits into batches when the file count limit is reached", async () => {
    const fetchMock = okResponder();
    vi.stubGlobal("fetch", fetchMock);

    const entries = Array.from({ length: UPLOAD_BATCH_MAX_FILES + 1 }, (_, i) =>
      makeEntry(`img-${i}.png`),
    );
    const result = await uploadImagesInBatches(entries);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(entries.length);
  });

  it("splits into batches when the byte limit is reached", async () => {
    const fetchMock = okResponder();
    vi.stubGlobal("fetch", fetchMock);

    const big = 15 * 1024 * 1024;
    await uploadImagesInBatches([makeEntry("a.png", big), makeEntry("b.png", 1)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps successful batches when another batch fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, { body }) => {
        call++;
        if (call === 1) return { ok: false, status: 413, statusText: "Payload Too Large" };
        return {
          ok: true,
          json: async () => ({
            paths: body.getAll("image").map((f) => ({ name: f.name, path: `images/${f.name}` })),
          }),
        };
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const entries = Array.from({ length: UPLOAD_BATCH_MAX_FILES + 1 }, (_, i) =>
      makeEntry(`img-${i}.png`),
    );
    const result = await uploadImagesInBatches(entries);

    // First batch rejected, second batch (one file) still resolved
    expect(result.size).toBe(1);
    expect(result.get(`img-${UPLOAD_BATCH_MAX_FILES}.png`)).toBe(
      `images/img-${UPLOAD_BATCH_MAX_FILES}.png`,
    );
  });

  it("reports progress after each batch", async () => {
    vi.stubGlobal("fetch", okResponder());
    const onProgress = vi.fn();

    const entries = Array.from({ length: UPLOAD_BATCH_MAX_FILES + 2 }, (_, i) =>
      makeEntry(`img-${i}.png`),
    );
    await uploadImagesInBatches(entries, { onProgress });

    expect(onProgress.mock.calls).toEqual([
      [UPLOAD_BATCH_MAX_FILES, entries.length],
      [entries.length, entries.length],
    ]);
  });

  it("propagates cancellation instead of continuing to upload", async () => {
    const fetchMock = okResponder();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadImagesInBatches([makeEntry("a.png")], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
