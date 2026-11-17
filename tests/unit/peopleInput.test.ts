import { afterEach, describe, expect, it, vi } from "vitest";
import { signInEnabled } from "../../lib/flags";
import { closestNames, personEmail, personName, personNameKey } from "../../lib/peopleInput";

afterEach(() => vi.unstubAllEnvs());

describe("person input and feature switch", () => {
  it("normalizes email and keeps the exact task name apart from outside spaces", () => {
    expect(personEmail("  AUDREY.WIJAYA@DEUSHCS.COM ")).toBe("audrey.wijaya@deushcs.com");
    expect(personName("  Audrey Wijaya  ")).toBe("Audrey Wijaya");
    expect(personNameKey("  AUDREY   Wijaya ")).toBe(personNameKey("Audrey Wijaya"));
    expect(personNameKey("Ａｕｄｒｅｙ")).toBe("audrey");
  });
  it.each(["", " ", "a@other.com", "a@deushcs.com.evil.test", "a/b@deushcs.com", "a@@deushcs.com", `${"a".repeat(120)}@deushcs.com`])("refuses invalid or overlong email %s", (email) => {
    expect(() => personEmail(email)).toThrow("deushcs.com email");
  });
  it.each(["", "  ", "Full Team", "Audrey\nWijaya", "a".repeat(201)])("refuses a blank, placeholder, control character or overlong name", (name) => {
    expect(() => personName(name)).toThrow("person's name");
  });
  it("finds nearby task names, removing blanks, placeholders and duplicates", () => {
    expect(closestNames("Audry", ["Gregory", "Audrey", "Audrey", "", "Full Team"])).toEqual(["Audrey", "Gregory"]);
    expect(personName("a".repeat(200))).toHaveLength(200);
  });
  it("reads the flag each time; only 1 enables sign-in", () => {
    for (const value of ["", "0", "true", "1", "0"]) {
      vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", value);
      expect(signInEnabled()).toBe(value === "1");
    }
  });
});
