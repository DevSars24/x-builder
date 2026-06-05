import { describe, expect, it } from "vitest";
import { WriterPage } from "../writer-page";

describe("WriterPage", () => {
  it("exports the writer page component", () => {
    expect(WriterPage).toBeTypeOf("function");
  });
});
