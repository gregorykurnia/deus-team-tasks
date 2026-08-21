import { NewTask } from "./types";

export const SEED_TASKS: NewTask[] = [
  {
    order: 0,
    task: "Greg conducts a meeting with the whole team to walk through the entire flow. If needed, hold a separate session with Bu Sovie, Ko Will, and Fir to directly communicate data-to-system support processes.",
    responsible: ["Greg"],
    informed: [{ name: "Full Team" }],
    keyPoints: "Reinforce the importance of inter-team communication and collaboration.",
    startDate: "2026-08-24",
    endDate: "2026-08-24",
  },
  {
    order: 1,
    task: "David completes all documentation, including special case documentation.",
    responsible: ["David"],
    informed: [
      { name: "Bu Sovie", note: "backup" },
      { name: "Fir", note: "recipient" },
    ],
    keyPoints:
      "Documentation should be written in a way that's easy for Fir to understand. Fir must review everything thoroughly — if needed, arrange a sit-down session. For any unclear items after David has left, check with Bu Sovie.",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
  },
  {
    order: 2,
    task: "Fir reviews David's documentation.",
    responsible: ["Fir"],
    informed: [{ name: "David" }],
    keyPoints: "Any questions that come up should be clearly noted down. Review must be thorough.",
    startDate: "2026-08-25",
    endDate: "2026-08-26",
  },
  {
    order: 3,
    task: "David's last day at DEUS.",
    responsible: ["David"],
    informed: [],
    keyPoints: "",
    startDate: "2026-08-28",
    endDate: "2026-08-28",
  },
  {
    order: 4,
    task: "Ko Will conducts system testing until stable, then begins documentation.",
    responsible: ["Ko Will"],
    informed: [],
    keyPoints:
      "Documentation should include UI/UX screenshots of each page alongside clear descriptions, and must be written in a format readable by QA.",
    startDate: "2026-08-31",
    endDate: "2026-09-04",
  },
  {
    order: 5,
    task: "Ko Will briefs the team on the new system. (Daily 2:00 PM – 4:00 PM, exact time TBD)",
    responsible: ["Ko Will"],
    informed: [
      { name: "Fir", note: "recipient" },
      { name: "Bu Sovie", note: "recipient" },
      { name: "Thania", note: "recipient" },
    ],
    keyPoints:
      "End-to-end walkthrough of the system. Highlight new features and changes compared to the old system. Cover process flows for both web inputs and data inputs. Explain system behavior. All attendees must take clear notes and flag any questions. One full week is allocated to ensure everyone has a solid understanding.",
    startDate: "2026-09-07",
    endDate: "2026-09-11",
  },
  {
    order: 6,
    task: "Team runs a simulation of the full usage flow.",
    responsible: ["Thania", "Fir", "Bu Sovie"],
    informed: [{ name: "Ko Will", note: "observer" }],
    keyPoints:
      "Thania re-explains the system to the rest of the team. Fir covers the technical side. Bu Sovie simulates the data-to-system process flow on the new system.",
    startDate: "2026-09-11",
    endDate: "2026-09-11",
  },
  {
    order: 7,
    task: "Discussion on the QA testing process.",
    responsible: ["Ko Will"],
    informed: [
      { name: "Yuli", note: "recipient" },
      { name: "Greg", note: "mediator" },
    ],
    keyPoints:
      "Ko Will updates Yuli on self-testing completed and checks her level of understanding. Yuli raises any remaining questions with Ko Will.",
    startDate: "2026-09-14",
    endDate: "2026-09-14",
  },
  {
    order: 8,
    task: "Creation of QA test case scenarios.",
    responsible: ["Yuli"],
    informed: [{ name: "Ko Will", note: "reviewer" }],
    keyPoints: "Yuli drafts the test cases; Ko Will reviews and approves before testing begins.",
    startDate: "2026-09-14",
    endDate: "2026-09-15",
  },
  {
    order: 9,
    task: "QA testing underway.",
    responsible: ["Yuli"],
    informed: [],
    keyPoints:
      "Yuli conducts testing and produces a test report. Ko Will then reviews the report and works with Fir to fix any bugs.",
    startDate: "2026-09-15",
    endDate: "2026-09-20",
  },
  {
    order: 10,
    task: "Bu Sovie walks Ko Will and Fir through the data process.",
    responsible: ["Bu Sovie"],
    informed: [
      { name: "Ko Will", note: "recipient" },
      { name: "Fir", note: "recipient" },
      { name: "Greg", note: "mediator" },
    ],
    keyPoints:
      "All three must be fully aligned on data knowledge so Ko Will and Fir are ready to support Bu Sovie going forward. Greg should emphasize the importance of the cross-check process, consistent with how it was done with David.",
    startDate: "2026-09-15",
    endDate: "2026-09-15",
  },
  {
    order: 11,
    task: "Bug fixing following QA.",
    responsible: ["Ko Will"],
    informed: [{ name: "Fir" }],
    keyPoints: "Fir shadows the process, but Ko Will leads all fixes for now, using Claude Code.",
    startDate: "2026-09-21",
    endDate: "2026-09-25",
  },
  {
    order: 12,
    task: "Greg aligns with Ko Will in preparation for the Lida briefing.",
    responsible: ["Greg"],
    informed: [
      { name: "Ko Will", note: "attendee" },
      { name: "Thania", note: "attendee" },
    ],
    keyPoints:
      "Greg simulates explaining the system as if presenting directly to Lida. Prepare likely Q&As and objection-handling responses.",
    startDate: "2026-09-20",
    endDate: "2026-09-21",
  },
  {
    order: 13,
    task: "Greg briefs Mba Lida on the new system changes.",
    responsible: ["Greg"],
    informed: [
      { name: "Mba Lida", note: "recipient" },
      { name: "Ko Will", note: "support" },
      { name: "Thania", note: "support" },
    ],
    keyPoints: "Frame the changes as a system upgrade. Ko Will and Thania present as backup support.",
    startDate: "2026-09-22",
    endDate: "2026-09-22",
  },
];
