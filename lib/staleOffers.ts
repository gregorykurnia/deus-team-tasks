// Typing that couldn't be saved is offered back with Try again (flows, 4.2). The offer can outlive its editor. Once newer
// typing in the same field has saved, the offer is stale (pressed, it would put the older words over the newer), so it
// is taken back.
const offers = new Map<string, { order: number; takeBack: () => void }[]>();
let lastOrder = 0;
const keyOf = (flowId: string, field: string) => `${flowId}:${field}`;

// The order the next offer or write will get: a write started now is newer than every offer made before.
export const nextOfferOrder = () => lastOrder + 1;

export function offerTyping(flowId: string, fields: string[], takeBack: () => void): void {
  const order = ++lastOrder;
  for (const f of fields) offers.set(keyOf(flowId, f), [...(offers.get(keyOf(flowId, f)) ?? []), { order, takeBack }]);
}

// A write that started at `since` and carried these fields has saved: the older offers for them go.
export function supersede(flowId: string, fields: string[], since: number): void {
  for (const f of fields) {
    const list = offers.get(keyOf(flowId, f)) ?? [];
    list.filter((o) => o.order < since).forEach((o) => o.takeBack());
    const rest = list.filter((o) => o.order >= since);
    if (rest.length) offers.set(keyOf(flowId, f), rest);
    else offers.delete(keyOf(flowId, f));
  }
}

export function resetOffers(): void {
  offers.clear();
  lastOrder = 0;
}
