import { describe, expect, it } from "vitest";
import {
  createDeletePatch,
  createEditPatch,
  createInsertPatch,
  invertPatch,
  isDelete,
  isInsert,
  isNoOp,
} from "../data/store/slide-patch.js";

describe("slide patches", () => {
  it("creates edit patches", () => {
    expect(createEditPatch(1, "before", "after", "ai")).toMatchObject({
      index: 1,
      before: "before",
      after: "after",
      source: "ai",
    });
  });

  it("creates insert and delete patches", () => {
    expect(createInsertPatch(1, "new")).toMatchObject({ index: 1, before: null, after: "new" });
    expect(createDeletePatch(1, "old")).toMatchObject({ index: 1, before: "old", after: null });
  });

  it("classifies patch types", () => {
    const insert = createInsertPatch(0, "new");
    const edit = createEditPatch(0, "old", "new");
    const remove = createDeletePatch(0, "old");
    expect(isInsert(insert)).toBe(true);
    expect(isDelete(remove)).toBe(true);
    expect(isNoOp(edit)).toBe(false);
    expect(isNoOp({ before: null, after: null })).toBe(true);
  });

  it("inverts before and after", () => {
    const patch = createEditPatch(2, "old", "new", "system");
    expect(invertPatch(patch)).toMatchObject({
      index: 2,
      before: "new",
      after: "old",
      source: "system",
    });
  });
});
