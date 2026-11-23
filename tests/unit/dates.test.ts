import { describe, expect, it } from "vitest";
import { parseDayFirstDate } from "@/lib/dates";

describe("parseDayFirstDate", () => {
  it.each([
    ["5 Feb 2027", "2027-02-05"],
    [" 1 december 2026 ", "2026-12-01"],
    ["02/05/2027", "2027-05-02"],
    ["2027-02-05", "2027-02-05"],
    ["29 FEB 2028", "2028-02-29"],
    ["", null],
    ["31 Feb 2027", null],
    ["29 Feb 2027", null],
    ["12/15/2027", null],
    ["5 Feb", null],
    ["2027-02-30", null],
  ])("reads %j as %j", (text, expected) => {
    expect(parseDayFirstDate(text)).toBe(expected);
  });
});
