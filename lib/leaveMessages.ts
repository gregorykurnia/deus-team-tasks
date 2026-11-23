import { noticeName } from "./assignNotify";
import { plural } from "./dates";
import { dateRange, days, LEAVE_TYPE_LABELS, type LeaveAdjustment, type LeaveRequest } from "./leave";
import type { PushMessage } from "./pushTransport.server";

type RequestDates = Pick<LeaveRequest, "id" | "type" | "start" | "end">;
const teamUrl = "/leave?view=team";
const requestUrl = (id: string) => `/leave?request=${encodeURIComponent(id)}`;

function typeAndDates(request: RequestDates, today: string): string {
  return `${LEAVE_TYPE_LABELS[request.type]}, ${dateRange(request.start, request.end, today)}`;
}

export function leaveRequestedMessage(request: RequestDates & Pick<LeaveRequest, "name">, count: number, today: string): PushMessage {
  return {
    title: "Leave request",
    body: `${noticeName(request.name)}: ${typeAndDates(request, today)} (${days(count)})`,
    url: `${teamUrl}&request=${encodeURIComponent(request.id)}`,
  };
}

export function leaveDecidedMessage(request: RequestDates & Pick<LeaveRequest, "status" | "rejectReason">, today: string): PushMessage {
  const rejected = request.status === "rejected";
  const reason = rejected && request.rejectReason?.trim();
  const dates = dateRange(request.start, request.end, today);
  return {
    title: `${LEAVE_TYPE_LABELS[request.type]} ${rejected ? "not approved" : "approved"}`,
    body: reason ? `${dates}\n${noticeName(reason)}` : dates,
    url: requestUrl(request.id),
  };
}

export function leaveCancelledMessage(request: RequestDates & Pick<LeaveRequest, "email">, actorName: string, ownRequest: boolean, today: string): PushMessage {
  return {
    title: `${noticeName(actorName)} ${ownRequest ? "cancelled leave" : "cancelled your leave"}`,
    body: typeAndDates(request, today),
    url: ownRequest ? `${teamUrl}&person=${encodeURIComponent(request.email)}` : requestUrl(request.id),
  };
}

export function leaveAddedMessage(request: RequestDates, actorName: string, today: string): PushMessage {
  return {
    title: `${noticeName(actorName)} added leave for you`,
    body: typeAndDates(request, today),
    url: requestUrl(request.id),
  };
}

export function leaveAdjustedMessage(adjustment: Pick<LeaveAdjustment, "days" | "reason">): PushMessage {
  const change = `${adjustment.days > 0 ? "+" : ""}${days(adjustment.days)}`;
  const reason = adjustment.reason.trim();
  return {
    title: "Your leave balance changed",
    body: reason ? `${change}: ${noticeName(reason)}` : change,
    url: "/leave?view=history",
  };
}

export function leaveWaitingMessage(count: number): PushMessage | undefined {
  if (!Number.isSafeInteger(count) || count < 1) return;
  return {
    title: `${plural(count, "leave request")} waiting`,
    body: `Leave: ${count.toLocaleString("en-US")} waiting for you`,
    url: teamUrl,
  };
}
