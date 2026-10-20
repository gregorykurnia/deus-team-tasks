// The display components (guide 4.1, 4.4, 4.5, 4.12, 4.14, 4.15): the states the screens rely on,
// and the words a screen reader hears. Looks are checked in the gallery against the prototype.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "@/ui/Button";
import Pill from "@/ui/Pill";
import { GroupTag, KindTag, LiveTag, OutsideTag, ReadOnlyTag, SectorTag } from "@/ui/Tag";
import OptionChip, { MoreChip } from "@/ui/OptionChip";
import Avatar from "@/ui/Avatar";
import AvatarStack from "@/ui/AvatarStack";
import PersonChip from "@/ui/PersonChip";
import Notice from "@/ui/Notice";
import EmptyState from "@/ui/EmptyState";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { LikelihoodMeter, LoadMeter } from "@/ui/Meter";

describe("buttons (guide 4.1)", () => {
  it("a busy button can't be pressed twice, reads as busy, and shows its busy label", () => {
    const markup = renderToStaticMarkup(<Button busy busyLabel="Adding…">Add task</Button>);
    expect(markup).toContain("Adding…");
    expect(markup).not.toContain("Add task");
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
  });

  it("a disabled button is disabled and not reported busy", () => {
    const markup = renderToStaticMarkup(<Button disabled>Mark done</Button>);
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("aria-busy");
  });

  it("buttons don't submit forms unless asked to", () => {
    expect(renderToStaticMarkup(<Button>Cancel</Button>)).toContain('type="button"');
  });

  it("an icon button keeps the label that names its target", () => {
    const markup = renderToStaticMarkup(
      <Button variant="icon" aria-label="Close">
        ×
      </Button>
    );
    expect(markup).toContain('aria-label="Close"');
  });
});

describe("pills and tags (guide 4.4)", () => {
  it("a deadline pill says its words, and the full date is on hover", () => {
    const markup = renderToStaticMarkup(
      <Pill tone="red" icon="alert" title="Deadline Mon 12 Oct">
        2 days late
      </Pill>
    );
    expect(markup).toContain("2 days late");
    expect(markup).toContain('title="Deadline Mon 12 Oct"');
  });

  it("a kind tag names the kind of work", () => {
    expect(renderToStaticMarkup(<KindTag kind="prospect" />)).toContain("Prospect work");
    expect(renderToStaticMarkup(<KindTag kind="client" />)).toContain("Client work");
    expect(renderToStaticMarkup(<KindTag kind="internal" />)).toContain("Internal");
  });

  it("the live and read-only tags carry words, not only colour", () => {
    expect(renderToStaticMarkup(<LiveTag />)).toContain("Just changed");
    expect(renderToStaticMarkup(<ReadOnlyTag />)).toContain("Read only");
  });

  it("outside tags, group tags and sector tags show their text", () => {
    expect(renderToStaticMarkup(<OutsideTag>Not counted</OutsideTag>)).toContain("Not counted");
    expect(renderToStaticMarkup(<GroupTag group="active">Active</GroupTag>)).toContain("Active");
    expect(renderToStaticMarkup(<SectorTag>Healthcare</SectorTag>)).toContain("Healthcare");
  });
});

describe("option chips (guide 4.4, 2.1)", () => {
  it("an option chip shows its label", () => {
    expect(renderToStaticMarkup(<OptionChip tone="teal">Warm</OptionChip>)).toContain("Warm");
  });

  it("a '+2' chip names the options it hides", () => {
    const markup = renderToStaticMarkup(<MoreChip count={2} names={["Pink", "Slate"]} />);
    expect(markup).toContain("+2");
    expect(markup).toContain('title="Pink, Slate"');
  });
});

describe("people (guide 4.5)", () => {
  it("an avatar shows initials, and the full name on hover", () => {
    const markup = renderToStaticMarkup(<Avatar name="Maya Chen" />);
    expect(markup).toContain(">MC<");
    expect(markup).toContain('title="Maya Chen"');
  });

  it("an informed person's avatar is marked, so it can be outlined", () => {
    expect(renderToStaticMarkup(<Avatar name="Kevin Tan" informed />)).toContain('data-informed="true"');
  });

  it("a stack reads everyone, owners first, with the note for informed people", () => {
    const markup = renderToStaticMarkup(
      <AvatarStack responsible={["Maya Chen"]} informed={[{ name: "Kevin Tan", note: "backup" }]} />
    );
    expect(markup).toContain('aria-label="Responsible: Maya Chen. Informed: Kevin Tan (backup)"');
  });

  it("a stack shows three people, then the count of the rest", () => {
    const markup = renderToStaticMarkup(
      <AvatarStack
        responsible={["Ana Ruiz", "Budi Santoso", "Citra Dewi", "Dimas Putra"]}
        informed={[{ name: "Eka Sari" }, { name: "Fajar Nugroho" }, { name: "Gita Maharani" }]}
      />
    );
    expect(markup).toContain("+4");
    expect(markup).toContain(
      'aria-label="Responsible: Ana Ruiz, Budi Santoso, Citra Dewi, Dimas Putra. Informed: Eka Sari, Fajar Nugroho, Gita Maharani"'
    );
  });

  it("a person chip names the person in its remove button", () => {
    const markup = renderToStaticMarkup(<PersonChip name="Maya Chen" onRemove={() => undefined} />);
    expect(markup).toContain('aria-label="Remove Maya Chen"');
  });

  it("the person being looked at is marked as current", () => {
    expect(renderToStaticMarkup(<PersonChip name="Maya Chen" current />)).toContain('data-current="true"');
  });
});

describe("notices (guide 4.14)", () => {
  it("an error notice is announced at once", () => {
    const markup = renderToStaticMarkup(
      <Notice tone="error" title="Could not create the group.">
        Nothing was lost.
      </Notice>
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not create the group.");
  });

  it("other notices are not announced as alerts", () => {
    const markup = renderToStaticMarkup(<Notice tone="info">Tasks work as usual.</Notice>);
    expect(markup).not.toContain('role="alert"');
  });
});

describe("empty states (guide 4.15)", () => {
  it("a large empty state has its title, what will appear, and its actions", () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        icon="flow"
        title="No flows yet"
        actions={<button type="button">New flow</button>}
      >
        Write down how a recurring process moves between people.
      </EmptyState>
    );
    expect(markup).toContain("No flows yet");
    expect(markup).toContain("Write down how a recurring process moves between people.");
    expect(markup).toContain("New flow");
  });

  it("the art is decorative, so it's hidden from screen readers", () => {
    expect(renderToStaticMarkup(<EmptyState icon="note" title="No notes" />)).toContain('aria-hidden="true"');
  });
});

describe("skeletons and loading (guide 4.15)", () => {
  it("skeleton shapes are decorative and hidden from screen readers", () => {
    expect(renderToStaticMarkup(<Skeleton width={120} height={14} />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<SkeletonRow />)).toContain('aria-hidden="true"');
  });

  it("the loading line is announced, with its words", () => {
    const markup = renderToStaticMarkup(<LoadingLine>Loading tasks</LoadingLine>);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading tasks");
  });
});

describe("meters (guide 4.5, 4.12)", () => {
  it("a load meter reads 'Load 3 of 5' and lights three bars", () => {
    const markup = renderToStaticMarkup(<LoadMeter load={3} />);
    expect(markup).toContain('aria-label="Load 3 of 5"');
    expect(markup.split('data-lit="true"').length - 1).toBe(3);
  });

  it("a likelihood meter says its word, or 'Not rated'", () => {
    expect(renderToStaticMarkup(<LikelihoodMeter rating={4} />)).toContain("High");
    expect(renderToStaticMarkup(<LikelihoodMeter rating={null} />)).toContain("Not rated");
  });
});
