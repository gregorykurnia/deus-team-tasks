import { describe, expect, it } from "vitest";
import { escapeCsvValue } from "@/lib/exportCsv";

describe("CSV values", () => {
  it("quotes text, and keeps text a spreadsheet would run as a formula as plain text", () => {
    expect(escapeCsvValue('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCsvValue("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(escapeCsvValue("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(escapeCsvValue(-5)).toBe('"-5"');
    expect(escapeCsvValue(null)).toBe('""');
  });
});
