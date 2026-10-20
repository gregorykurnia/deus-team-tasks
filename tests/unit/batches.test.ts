// Writing many in batches of 450 (lib/batches), with a fake batch: what goes in each, what's left out, and what a stop
// part way says was saved.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, WriteBatch } from "firebase/firestore";

const commits: number[][] = []; // the items each committed batch held
let failAt: number | null = null; // the batch (0-based) that fails

vi.mock("firebase/firestore", () => ({
  writeBatch: () => {
    const held: number[] = [];
    return {
      set: (item: number) => held.push(item),
      commit: async () => {
        if (failAt === commits.length) {
          failAt = null;
          throw new Error("unavailable");
        }
        commits.push(held);
      },
    };
  },
}));

const { commitEach, commitInChunks, PartlyCommitted } = await import("@/lib/batches");

const db = {} as Firestore;
const write = (batch: WriteBatch, item: number) => (batch as unknown as { set: (n: number) => void }).set(item);
const items = (n: number) => Array.from({ length: n }, (_, i) => i);

beforeEach(() => {
  commits.length = 0;
  failAt = null;
});

describe("batches of 450", () => {
  it("writes 451 items in two batches, in order, and returns them all", async () => {
    const written = await commitEach(db, items(451), write);
    expect(commits.map((c) => c.length)).toEqual([450, 1]);
    expect(commits.flat()).toEqual(items(451));
    expect(written).toEqual(items(451));
  });

  it("leaves out what keep turns down just before its batch, and skips a batch with nothing left", async () => {
    const gone = new Set<number>();
    const keep = (n: number) => !gone.has(n);
    gone.add(3);
    const written = await commitEach(db, items(901), (batch, n) => {
      write(batch, n);
      if (n === 449) items(451).forEach((m) => gone.add(450 + m)); // deleted meanwhile: the whole second batch
    }, keep);
    expect(commits.map((c) => c.length)).toEqual([449]);
    expect(written).toHaveLength(449);
    expect(written).not.toContain(3);
  });

  it("throws the first batch's error as it is, with nothing saved", async () => {
    failAt = 0;
    await expect(commitEach(db, items(451), write)).rejects.toThrow("unavailable");
    expect(commits).toEqual([]);
  });

  it("says what was saved when a later batch fails", async () => {
    failAt = 1;
    const err = await commitEach(db, items(1000), write).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartlyCommitted);
    const partly = err as InstanceType<typeof PartlyCommitted<number>>;
    expect(partly.done).toEqual(items(450));
    expect(partly.left).toEqual(items(550).map((n) => n + 450));
    expect((partly.cause as Error).message).toBe("unavailable");
    expect(commits.map((c) => c.length)).toEqual([450]);
  });

  it("commits plain writes the same way", async () => {
    await commitInChunks(db, items(900).map((n) => (batch) => write(batch, n)));
    expect(commits.map((c) => c.length)).toEqual([450, 450]);
  });
});
