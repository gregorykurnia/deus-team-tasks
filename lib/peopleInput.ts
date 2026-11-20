const WORK_EMAIL = /^[a-z0-9.!#$%&'*+?=^_`{|}~-]+@deushcs\.com$/;

// Firebase custom-token UIDs are the email and have a 128-character limit.
export function personEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 128 || !WORK_EMAIL.test(email)) {
    throw new Error("Use a deushcs.com email, at most 128 characters.");
  }
  return email;
}

export function personName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 200 || /[\p{Cc}\p{Cf}]/u.test(name) || name === "Full Team") {
    throw new Error("Use a person's name, from 1 to 200 characters, as it appears on tasks.");
  }
  return name;
}

export function personNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();
}

export function taskPersonKeys(name: string, email?: string): ReadonlySet<string> {
  const key = personNameKey(name);
  if (!key || key === "full team") return new Set();
  const address = email?.trim().toLowerCase();
  if (!address) return new Set([key]);
  // A work email in Responsible identifies its linked account, even if someone else uses it as a label.
  return new Set(WORK_EMAIL.test(key) ? [address] : [key, address]);
}

export function hasTaskPerson(people: unknown, keys: ReadonlySet<string>): boolean {
  return Array.isArray(people) && people.some((value) => typeof value === "string" && keys.has(personNameKey(value)));
}

export function closestNames(name: string, names: Iterable<string>): string[] {
  const target = personNameKey(name);
  const distance = (candidate: string) => {
    let row = Array.from({ length: target.length + 1 }, (_, i) => i);
    for (const letter of personNameKey(candidate)) {
      const next = [row[0] + 1];
      for (let i = 0; i < target.length; i++) {
        next.push(Math.min(next[i] + 1, row[i + 1] + 1, row[i] + (target[i] === letter ? 0 : 1)));
      }
      row = next;
    }
    return row[target.length];
  };
  return [...new Set(names)].filter((n) => n.trim() && n !== "Full Team")
    .map((name) => ({ name, distance: distance(name) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 3).map(({ name }) => name);
}
