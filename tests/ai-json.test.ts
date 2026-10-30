import { describe, expect, it } from "vitest";
import { extractJson } from "@/ai/json";

describe("extractJson", () => {
  it("extracts nested objects and arrays from surrounding prose", () => {
    expect(extractJson("Here is the result: {\"items\":[{\"value\":1}]} thanks")).toEqual({
      items: [{ value: 1 }],
    });
  });

  it("does not treat braces inside strings as structure", () => {
    expect(extractJson('{"comment":"use {x} and \\\"quotes\\\""} trailing')).toEqual({
      comment: 'use {x} and "quotes"',
    });
  });

  it("extracts fenced arrays", () => {
    expect(extractJson("```json\n[1, {\"ok\": true}]\n```")).toEqual([1, { ok: true }]);
  });

  it("rejects malformed or incomplete values", () => {
    expect(extractJson('{"ok": true')).toBeNull();
    expect(extractJson('{"ok": true]')).toBeNull();
    expect(extractJson("no structured response")).toBeNull();
    expect(extractJson(null as unknown as string)).toBeNull();
  });
});
