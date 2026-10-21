// Live changes (A1, guide 3 and 5.8): what just arrived glows and a colleague's change is tagged, each for its own time,
// and a burst of a colleague's changes makes one toast.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BULK_LIMIT, BURST_MS, expectOwnWrite, GLOW_MS, isExpectedOwn, MANY_CHANGES, noteChanges, onManyChanges, resetLiveChanges, subscribeLive, TAG_MS, TOAST_GAP_MS } from "@/lib/liveChanges";
import { nextOfferOrder, offerTyping, resetOffers, supersede } from "@/lib/staleOffers";

beforeEach(() => {
  vi.useFakeTimers();
  resetLiveChanges();
});
afterEach(() => {
  resetLiveChanges();
  vi.useRealTimers();
});

const none = { own: [] as string[], added: [] as string[], changed: [] as string[] };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);

describe("noteChanges", () => {
  it("fires the many-changes toast once a burst of a colleague's changes is large enough", () => {
    const many = vi.fn();
    onManyChanges(many);
    noteChanges("tasks", { ...none, changed: ids(MANY_CHANGES - 1) });
    vi.advanceTimersByTime(BURST_MS);
    expect(many).not.toHaveBeenCalled();
    noteChanges("tasks", { ...none, changed: ids(MANY_CHANGES) });
    vi.advanceTimersByTime(BURST_MS);
    expect(many).toHaveBeenCalledTimes(1);
  });

  it("counts changes across sources that arrive together as one burst", () => {
    const many = vi.fn();
    onManyChanges(many);
    noteChanges("tasks", { ...none, changed: ids(3) });
    noteChanges("companies", { ...none, added: ids(2) });
    vi.advanceTimersByTime(BURST_MS);
    expect(many).toHaveBeenCalledTimes(1);
  });

  it("doesn't count your own changes", () => {
    const many = vi.fn();
    onManyChanges(many);
    noteChanges("tasks", { ...none, own: ids(MANY_CHANGES * 3) });
    vi.advanceTimersByTime(BURST_MS);
    expect(many).not.toHaveBeenCalled();
  });

  it("makes at most one toast in a while", () => {
    const many = vi.fn();
    onManyChanges(many);
    const burst = () => {
      noteChanges("tasks", { ...none, changed: ids(MANY_CHANGES) });
      vi.advanceTimersByTime(BURST_MS);
    };
    burst();
    burst();
    expect(many).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_GAP_MS);
    burst();
    expect(many).toHaveBeenCalledTimes(2);
  });

  it("says a bulk change once, without lighting up every row", () => {
    const many = vi.fn();
    onManyChanges(many);
    const seen = vi.fn();
    const stop = subscribeTo(seen);
    noteChanges("tasks", { ...none, changed: ids(BULK_LIMIT + 1) });
    expect(seen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BURST_MS);
    expect(many).toHaveBeenCalledTimes(1);
    stop();
  });

  it("tells its readers when something arrives and when its glow and tag run out", () => {
    const seen = vi.fn();
    const stop = subscribeTo(seen);
    noteChanges("tasks", { ...none, changed: ["a"] });
    expect(seen).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(GLOW_MS);
    expect(seen).toHaveBeenCalledTimes(2); // the glow is over, the tag stays
    vi.advanceTimersByTime(TAG_MS);
    expect(seen).toHaveBeenCalledTimes(3);
    stop();
  });

  it("lets your own change glow without a tag, so it ends with the glow", () => {
    const seen = vi.fn();
    const stop = subscribeTo(seen);
    noteChanges("tasks", { ...none, own: ["a"] });
    vi.advanceTimersByTime(GLOW_MS);
    expect(seen).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(TAG_MS);
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
  });
});

// The hooks read the store through useSyncExternalStore; this is the same subscription without React.
const subscribeTo = subscribeLive;

describe("stale offers of typing", () => {
  afterEach(resetOffers);

  it("takes back an older offer when newer typing in the same field has saved", () => {
    const takeBack = vi.fn();
    offerTyping("flow1", ["step1.title"], takeBack);
    const since = nextOfferOrder();
    supersede("flow1", ["step1.title"], since);
    expect(takeBack).toHaveBeenCalledTimes(1);
    supersede("flow1", ["step1.title"], nextOfferOrder());
    expect(takeBack).toHaveBeenCalledTimes(1);
  });

  it("keeps offers for other fields and other flows", () => {
    const other = vi.fn();
    const sameFieldOtherFlow = vi.fn();
    offerTyping("flow1", ["step1.desc"], other);
    offerTyping("flow2", ["step1.title"], sameFieldOtherFlow);
    supersede("flow1", ["step1.title"], nextOfferOrder());
    expect(other).not.toHaveBeenCalled();
    expect(sameFieldOtherFlow).not.toHaveBeenCalled();
  });

  it("keeps an offer made after the saving write started", () => {
    const since = nextOfferOrder();
    const takeBack = vi.fn();
    offerTyping("flow1", ["step1.title"], takeBack);
    supersede("flow1", ["step1.title"], since);
    expect(takeBack).not.toHaveBeenCalled();
  });
});

describe("own writes made in a transaction", () => {
  it("count as this device's for a short while after they're announced, per source and id", () => {
    expectOwnWrite("flows", "f1");
    expect(isExpectedOwn("flows", "f1")).toBe(true);
    expect(isExpectedOwn("flows", "f2")).toBe(false);
    expect(isExpectedOwn("companies", "f1")).toBe(false);
    vi.advanceTimersByTime(15_001);
    expect(isExpectedOwn("flows", "f1")).toBe(false);
  });
});
