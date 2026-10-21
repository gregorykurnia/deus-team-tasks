// Fields (guide 4.2, 4.3, 4.13, 5.11, 8): the wiring a screen reader depends on. A label names its control, an error is tied
// to it and marks it invalid, toggles say whether they're pressed, and the pickers announce themselves as comboboxes.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Field from "@/ui/Field";
import { DateInput, InPlaceField, QuickDates, SearchField, Switch, TextArea, TextInput } from "@/ui/Inputs";
import Segmented from "@/ui/Segmented";
import FilterButton from "@/ui/FilterButton";
import { ChoiceChip, ChipGroup } from "@/ui/ChipGroup";
import PeoplePicker, { InformedList } from "@/ui/PeoplePicker";
import SectorPicker from "@/ui/SectorPicker";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const none = () => undefined;

describe("Field (guide 4.13)", () => {
  it("names its control with the label", () => {
    const markup = html(<Field label="Description">{(c) => <TextInput {...c} />}</Field>);
    const id = markup.match(/<label[^>]*for="([^"]+)"/)![1];
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain("Description");
  });

  it("says 'optional' beside the label when the field is optional", () => {
    expect(html(<Field label="Key points" optional>{(c) => <TextArea {...c} />}</Field>)).toContain("optional");
    expect(html(<Field label="Key points">{(c) => <TextArea {...c} />}</Field>)).not.toContain("optional");
  });

  it("ties an error to its control, and marks the control invalid", () => {
    const markup = html(
      <Field label="Description" error="Add a short description so the team knows what this is.">
        {(c) => <TextInput {...c} />}
      </Field>
    );
    const described = markup.match(/aria-describedby="([^"]+)"/)![1];
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(new RegExp(`id="${described}"[^>]*>(?:<svg[^]*?</svg>)?Add a short description`));
  });

  it("describes the control with its hint when there is no error", () => {
    const markup = html(
      <Field label="Deadline" hint="Leave it empty if there is none.">
        {(c) => <TextInput {...c} />}
      </Field>
    );
    const described = markup.match(/aria-describedby="([^"]+)"/)![1];
    expect(markup).toContain(`id="${described}"`);
    expect(markup).not.toContain("aria-invalid");
  });
});

describe("inputs (guide 4.13)", () => {
  it("a switch says whether it is on, with a label for its meaning", () => {
    expect(html(<Switch on label="Show completed" onChange={none} />)).toContain('aria-pressed="true"');
    const off = html(<Switch on={false} label="Show completed" onChange={none} />);
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('aria-label="Show completed"');
  });

  it("a date shows its clear button only when it has a date", () => {
    expect(html(<DateInput value="2026-10-21" onChange={none} aria-label="Deadline" />)).toContain('aria-label="Clear date"');
    expect(html(<DateInput value="" onChange={none} aria-label="Deadline" />)).not.toContain("Clear date");
    expect(html(<DateInput value="" onChange={none} aria-label="Deadline" />)).toContain('type="date"');
  });

  it("quick dates press the one that matches the date", () => {
    const markup = html(<QuickDates value="2026-10-21" today="2026-10-20" onPick={none} />);
    expect(markup).toContain("Today");
    expect(markup).toContain("Tomorrow");
    expect(markup).toContain("In a week");
    expect(markup.split('aria-pressed="true"').length - 1).toBe(1);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Tomorrow/);
  });

  it("search is a search field with a label", () => {
    const markup = html(<SearchField label="Search tasks" value="" onChange={none} placeholder="Search tasks" />);
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Search tasks"');
  });

  it("an in-place field keeps a label, and a long one is a text box", () => {
    expect(html(<InPlaceField aria-label="Flow title" defaultValue="Onboarding" />)).toContain('aria-label="Flow title"');
    expect(html(<InPlaceField multiline aria-label="Remarks" defaultValue="" />)).toContain("<textarea");
  });
});

describe("segmented, filters and chips (guide 4.2, 4.3, 4.4)", () => {
  const options = [
    { value: "all", label: "All", count: 128 },
    { value: "pro", label: "Prospects", count: 40 },
  ];

  it("a segmented control marks the chosen option, shows counts, and names its group", () => {
    const markup = html(<Segmented label="Kind of work" options={options} value="pro" onChange={none} />);
    expect(markup).toContain('aria-label="Kind of work"');
    expect(markup.split('aria-pressed="true"').length - 1).toBe(1);
    expect(markup).toContain("128");
  });

  it("a filter button that is off has no clear button", () => {
    const markup = html(<FilterButton label="Due" onClick={none} />);
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).not.toContain("Clear");
  });

  it("a filter button that is on shows its value and a clear button that names the filter", () => {
    const markup = html(<FilterButton label="Due" value="Overdue" onClick={none} onClear={none} />);
    expect(markup).toContain("Overdue");
    expect(markup).toContain('aria-label="Clear the due filter"');
  });

  it("choice chips say whether they are pressed", () => {
    expect(html(<ChoiceChip pressed onClick={none}>Call</ChoiceChip>)).toContain('aria-pressed="true"');
    const group = html(<ChipGroup label="Touch point" options={[{ value: "call", label: "Call" }, { value: "mail", label: "Email" }]} value="mail" onChange={none} />);
    expect(group).toContain('aria-label="Touch point"');
    expect(group.split('aria-pressed="true"').length - 1).toBe(1);
  });
});

describe("pickers (guide 4.13, 5.11)", () => {
  const names = [
    { name: "Maya Chen", open: 5 },
    { name: "Kevin Tan", open: 0 },
  ];

  it("the people picker shows chosen people with a remove button each, and a combobox for the next", () => {
    const markup = html(<PeoplePicker value={["Maya Chen"]} onChange={none} suggestions={names} aria-label="Responsible" />);
    expect(markup).toContain("Maya Chen");
    expect(markup).toContain('aria-label="Remove Maya Chen"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("the informed list has a note field and a remove button for each person, and an add line", () => {
    const markup = html(<InformedList value={[{ name: "Kevin Tan", note: "backup" }]} onChange={none} suggestions={names} />);
    expect(markup).toContain('aria-label="Their part for Kevin Tan"');
    expect(markup).toContain('aria-label="Remove Kevin Tan"');
    expect(markup).toContain("Add someone to keep informed");
  });

  it("the sector picker says before saving whether a spelling is the same sector or a new one", () => {
    const sectors = [{ name: "Retail", count: 12 }];
    expect(html(<SectorPicker value="retail" onChange={none} sectors={sectors} aria-label="Sector" />)).toContain("Same sector as “Retail”, so it’s saved that way.");
    expect(html(<SectorPicker value="Agritech" onChange={none} sectors={sectors} aria-label="Sector" />)).toContain("“Agritech” will be a new sector.");
    expect(html(<SectorPicker value="" onChange={none} sectors={sectors} aria-label="Sector" />)).toContain('role="combobox"');
  });
});
