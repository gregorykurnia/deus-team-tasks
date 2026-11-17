// A completed process is not a clean audit if any state failed or reported issues.
export function auditFailed(report) {
  return report.some((state) => state.failed || state.errors?.length || state.violations?.length);
}
