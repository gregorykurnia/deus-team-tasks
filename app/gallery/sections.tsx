// The display components, each with its states (task 2.4). Dev only: the page calls notFound() in production.
import type { ReactNode } from "react";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Pill from "@/ui/Pill";
import { GroupTag, KindTag, LiveTag, OutsideTag, ReadOnlyTag, SectorTag } from "@/ui/Tag";
import OptionChip, { MoreChip, type OptionTone } from "@/ui/OptionChip";
import Avatar from "@/ui/Avatar";
import AvatarStack from "@/ui/AvatarStack";
import PersonChip from "@/ui/PersonChip";
import Notice from "@/ui/Notice";
import EmptyState from "@/ui/EmptyState";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { LikelihoodMeter, LoadMeter, type Rating } from "@/ui/Meter";
import { Suspense } from "react";
import { ToasterProvider } from "@/ui/Toaster";
import FieldDemos from "./FieldDemos";
import OverlayDemos from "./OverlayDemos";
import TaskRowDemos from "./TaskRowDemos";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12">
      <h2 id={`${id}-title`} className="text-[15px] font-extrabold text-ink">
        {title}
      </h2>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-5">{children}</div>
    </section>
  );
}

// One state of a component, with its name under it.
function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-start gap-2">
      {children}
      <figcaption className="text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}

export function Buttons() {
  return (
    <Section id="buttons" title="Buttons (4.1)">
      <State label="main">
        <Button variant="main">New task</Button>
      </State>
      <State label="main, small">
        <Button variant="main" small>
          Save changes
        </Button>
      </State>
      <State label="main, disabled">
        <Button variant="main" disabled>
          Create group
        </Button>
      </State>
      <State label="main, busy">
        <Button variant="main" busy busyLabel="Adding…">
          Add task
        </Button>
      </State>
      <State label="danger">
        <Button variant="danger">Delete</Button>
      </State>
      <State label="secondary">
        <Button>Mark done</Button>
      </State>
      <State label="secondary, small">
        <Button small>Edit flow</Button>
      </State>
      <State label="secondary, busy">
        <Button busy busyLabel="Moving…">
          Move
        </Button>
      </State>
      <State label="quiet">
        <Button variant="quiet">All 128 open tasks</Button>
      </State>
      <State label="quiet red">
        <Button variant="quietRed">Delete</Button>
      </State>
      <State label="icon">
        <Button variant="icon" aria-label="Close">
          <Icon name="x" />
        </Button>
      </State>
      <State label="icon, glass">
        <Button variant="icon" glass aria-label="Close">
          <Icon name="x" />
        </Button>
      </State>
      <State label="link">
        <Button variant="link">See all 12</Button>
      </State>
      <State label="add line">
        <Button variant="addLine">Add a step</Button>
      </State>
    </Section>
  );
}

export function Pills() {
  return (
    <Section id="pills" title="Deadline pills (4.4)">
      <Pill tone="red" icon="alert" title="Deadline Mon 6 Oct">
        2 days late
      </Pill>
      <Pill tone="amber" title="Deadline Tue 20 Oct">
        Today
      </Pill>
      <Pill tone="amber" title="Deadline Wed 21 Oct">
        Tomorrow
      </Pill>
      <Pill tone="amber" title="Deadline Fri 23 Oct">
        In 3 days
      </Pill>
      <Pill tone="calm" title="Deadline Wed 1 Dec">
        In 42 days
      </Pill>
      <Pill tone="calm" title="Deadline Fri 4 Dec">
        4 Dec
      </Pill>
      <Pill tone="none" title="No deadline set">
        No deadline
      </Pill>
      <Pill tone="done" title="Finished Mon 19 Oct">
        Done yesterday
      </Pill>
    </Section>
  );
}

export function Tags() {
  return (
    <Section id="tags" title="Tags (4.4)">
      <KindTag kind="pro" />
      <KindTag kind="cli" />
      <KindTag kind="int" />
      <GroupTag group="toApproach">To approach</GroupTag>
      <GroupTag group="active">Active</GroupTag>
      <GroupTag group="dealDone">Deal done</GroupTag>
      <GroupTag group="noOrNotNow">No or not now</GroupTag>
      <OutsideTag>Not counted</OutsideTag>
      <OutsideTag>Not tracked yet</OutsideTag>
      <LiveTag />
      <ReadOnlyTag />
      <SectorTag>Healthcare</SectorTag>
    </Section>
  );
}

const OPTIONS: OptionTone[] = ["blue", "sky", "teal", "green", "amber", "red", "violet", "pink", "slate"];

export function OptionChips() {
  return (
    <Section id="option-chips" title="Option chips (4.4, C3)">
      {OPTIONS.map((tone) => (
        <OptionChip key={tone} tone={tone}>
          {tone[0].toUpperCase() + tone.slice(1)}
        </OptionChip>
      ))}
      <MoreChip count={2} names={["Pink", "Slate"]} />
    </Section>
  );
}

export function People() {
  return (
    <Section id="people" title="People (4.5)">
      <State label="list, 30px">
        <div className="flex gap-2">
          <Avatar name="Maya Chen" />
          <Avatar name="Kevin Tan" />
          <Avatar name="Nadia Pratama" />
          <Avatar name="Budi Santoso" />
        </div>
      </State>
      <State label="informed (outlined)">
        <div className="flex gap-2">
          <Avatar name="Kevin Tan" informed />
        </div>
      </State>
      <State label="plan, 34px">
        <Avatar name="Maya Chen" size="plan" />
      </State>
      <State label="page, 72px">
        <Avatar name="Maya Chen" size="page" />
      </State>
      <State label="stack, owners and informed">
        <AvatarStack responsible={["Maya Chen"]} informed={[{ name: "Kevin Tan", note: "backup" }]} />
      </State>
      <State label="stack, +4">
        <AvatarStack
          responsible={["Ana Ruiz", "Budi Santoso", "Citra Dewi", "Dimas Putra"]}
          informed={[{ name: "Eka Sari" }, { name: "Fajar Nugroho" }, { name: "Gita Maharani" }]}
        />
      </State>
      <State label="person chip">
        <PersonChip name="Maya Chen" removable />
      </State>
      <State label="person chip, current">
        <PersonChip name="Maya Chen" current />
      </State>
    </Section>
  );
}

export function Notices() {
  return (
    <Section id="notices" title="Notices (4.14)">
      <div className="flex w-full max-w-[560px] flex-col gap-3">
        <Notice tone="info" title="The team calendar isn’t connected.">
          Meetings and events will show here once it’s set up. Tasks work as usual.
        </Notice>
        <Notice tone="warning" title="Couldn't load today's events.">
          The team calendar didn’t respond. Tasks work as usual.
        </Notice>
        <Notice tone="error" title="Couldn't create the group.">
          Check your connection and try again. Nothing was lost.
        </Notice>
        <Notice tone="success" title="Installed on this device." />
        <Notice tone="inline">Their part: Kevin Tan sends the revised quote.</Notice>
        <Notice tone="inlineMuted">Its subsidiaries still count towards the totals.</Notice>
      </div>
    </Section>
  );
}

export function Empty() {
  return (
    <Section id="empty" title="Empty, loading and meters (4.15, 4.5, 4.12)">
      <div className="grid w-full gap-6 md:grid-cols-2">
        <div className="rounded-panel bg-glass-strong">
          <EmptyState
            icon="flow"
            title="No flows yet"
            actions={<Button variant="main" small>New flow</Button>}
          >
            Write down how a recurring process moves between people.
          </EmptyState>
        </div>
        <div className="rounded-panel bg-glass-strong">
          <EmptyState size="small" icon="cal" title="No events today">
            Nothing is on the team calendar.
          </EmptyState>
        </div>
        <div className="rounded-panel bg-glass-strong">
          <EmptyState
            size="small"
            icon="search"
            title="Nothing open matches “budget”"
            actions={<Button small>Clear search</Button>}
          />
        </div>
        <div className="flex flex-col gap-4 rounded-panel bg-glass-strong p-5">
          <LoadingLine>Loading tasks</LoadingLine>
          <SkeletonRow />
          <SkeletonRow />
          <Skeleton width="60%" height={13} />
        </div>
      </div>
    </Section>
  );
}

export function Meters() {
  const ratings: (Rating | null)[] = [5, 4, 3, 2, 1, null];
  return (
    <Section id="meters" title="Meters (4.5, 4.12)">
      <State label="load 1 of 5">
        <LoadMeter load={1} />
      </State>
      <State label="load 3 of 5">
        <LoadMeter load={3} />
      </State>
      <State label="load 5 of 5">
        <LoadMeter load={5} />
      </State>
      {ratings.map((rating) => (
        <State key={String(rating)} label={rating === null ? "not rated" : `rating ${rating}`}>
          <LikelihoodMeter rating={rating} />
        </State>
      ))}
    </Section>
  );
}

export function Overlays() {
  return (
    <Section id="overlays" title="Overlays (4.3, 4.11, 4.14)">
      <div className="w-full">
        <ToasterProvider>
          <Suspense fallback={null}>
            <OverlayDemos />
          </Suspense>
        </ToasterProvider>
      </div>
    </Section>
  );
}

export function Fields() {
  return (
    <Section id="fields" title="Fields (4.2, 4.3, 4.13, 5.11)">
      <FieldDemos />
    </Section>
  );
}

export function TaskRows() {
  return (
    <Section id="task-rows" title="Task rows (4.6, 4.7, 5.1)">
      <TaskRowDemos />
    </Section>
  );
}
