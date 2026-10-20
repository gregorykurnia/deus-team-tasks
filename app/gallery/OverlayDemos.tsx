"use client";

// Overlays in their states (task 2.5): menus, sheets, dialogs, confirmations and toasts, opened from here.
// ?open=<name> opens one on load, for screenshots.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/ui/Button";
import Dialog, { Confirm } from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import Menu, { MenuCheck, MenuChoice, MenuFoot, MenuHeading, MenuItem, MenuNumber, MenuPalette, MenuSeparator } from "@/ui/Menu";
import type { OptionTone } from "@/ui/OptionChip";
import PeoplePicker from "@/ui/PeoplePicker";
import Sheet, { SheetSpacer } from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";

type MenuName = "one" | "several" | "number" | "items" | "palette";
type Overlay = "sheet" | "short" | "dialog" | "confirm" | "details" | null;

const TONES: OptionTone[] = ["blue", "sky", "teal", "green", "amber", "red", "violet", "pink", "slate"];
const PRODUCTS = ["POS", "Loyalty", "Analytics", "Payments"];
const OWNERS = [
  { name: "Maya Chen", open: 5 },
  { name: "Nadia Pratama", open: 3 },
];
const OVERLAYS = ["sheet", "short", "dialog", "details"];

export default function OverlayDemos() {
  const toast = useToast();
  const initial = useSearchParams().get("open");
  const [menu, setMenu] = useState<MenuName | null>(() => (initial?.startsWith("menu-") ? (initial.slice(5) as MenuName) : null));
  const [overlay, setOverlay] = useState<Overlay>(() => (OVERLAYS.includes(initial as Overlay & string) ? (initial as Overlay) : null));
  const [confirmOpen, setConfirmOpen] = useState(initial === "confirm");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("Within 3 days");
  const [products, setProducts] = useState<string[]>(["POS"]);
  const [owners, setOwners] = useState<string[]>([]);
  const [tone, setTone] = useState<OptionTone>("teal");

  const oneRef = useRef<HTMLButtonElement>(null);
  const severalRef = useRef<HTMLButtonElement>(null);
  const numberRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (initial !== "toasts") return;
    toast("Saved");
    toast("Marked done", { action: "Undo" });
    toast("No connection. The task wasn’t added.", { error: true });
  }, [initial, toast]);

  const menuButton = (name: MenuName, ref: RefObject<HTMLButtonElement | null>, label: string) => (
    <Button ref={ref} aria-haspopup="menu" aria-expanded={menu === name} onClick={() => setMenu(name)}>
      {label}
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {menuButton("one", oneRef, "Menu: pick one")}
        {menuButton("several", severalRef, "Menu: pick several")}
        {menuButton("number", numberRef, "Menu: number")}
        {menuButton("items", itemsRef, "Menu: red and disabled items")}
        {menuButton("palette", paletteRef, "Menu: palette")}
        <Button onClick={() => setOverlay("sheet")}>Sheet</Button>
        <Button onClick={() => setOverlay("short")}>Short sheet</Button>
        <Button onClick={() => setOverlay("dialog")}>Dialog</Button>
        <Button onClick={() => setConfirmOpen(true)}>Confirm</Button>
        <Button onClick={() => setOverlay("details")}>Confirm over a sheet</Button>
        <Button onClick={() => toast("Saved")}>Toast</Button>
        <Button onClick={() => toast("Marked done", { action: "Undo", onAction: () => setNote("Undone: Marked done") })}>Toast with action</Button>
        <Button onClick={() => toast("No connection. The task wasn’t added.", { error: true })}>Error toast</Button>
      </div>
      <div className="mt-4 space-y-1 text-[13px] text-ink-2" aria-live="polite">
        {note && <p>{note}</p>}
        <p className="text-muted">Due: {due}. Products: {products.join(", ") || "none"}. Colour: {tone}.</p>
      </div>

      <Menu open={menu === "one"} anchorRef={oneRef} onClose={() => setMenu(null)} label="Due">
        {["Overdue", "Within 3 days", "Later"].map((v) => (
          <MenuChoice
            key={v}
            checked={due === v}
            onSelect={() => {
              setDue(v);
              setNote(`Picked: ${v}`);
            }}
          >
            {v}
          </MenuChoice>
        ))}
      </Menu>
      <Menu open={menu === "several"} anchorRef={severalRef} onClose={() => setMenu(null)} label="Product">
        <MenuHeading>Product</MenuHeading>
        {PRODUCTS.map((p) => (
          <MenuCheck key={p} checked={products.includes(p)} onSelect={() => setProducts((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]))}>
            {p}
          </MenuCheck>
        ))}
      </Menu>
      <Menu open={menu === "number"} anchorRef={numberRef} onClose={() => setMenu(null)} label="No action for">
        <MenuHeading>No action for</MenuHeading>
        <MenuNumber label="At least" unit="days" initial={21} onApply={(n) => setNote(`Picked: ${n} days`)} />
      </Menu>
      <Menu open={menu === "items"} anchorRef={itemsRef} onClose={() => setMenu(null)} label="Task actions">
        <MenuItem icon="done" onSelect={() => setNote("Picked: Mark done")}>
          Mark done
        </MenuItem>
        <MenuItem icon="swap" disabled describedBy="move-why">
          Move to group
        </MenuItem>
        <MenuFoot id="move-why">Company tasks stay with their companies</MenuFoot>
        <MenuSeparator />
        <MenuItem icon="trash" danger onSelect={() => setNote("Picked: Delete")}>
          Delete
        </MenuItem>
      </Menu>
      <Menu open={menu === "palette"} anchorRef={paletteRef} onClose={() => setMenu(null)} label="Colour">
        <MenuPalette tones={TONES} value={tone} onPick={setTone} />
      </Menu>

      <Sheet
        open={overlay === "sheet"}
        onClose={() => setOverlay(null)}
        title="New task"
        initialFocus="textarea"
        footer={
          <>
            <SheetSpacer />
            <Button onClick={() => setOverlay(null)}>Cancel</Button>
            <Button variant="main" small onClick={() => setOverlay(null)}>
              Add task
            </Button>
          </>
        }
      >
        <label className="mt-4 block text-[13px] font-bold text-ink-2">
          Description
          <textarea className="mt-2 block min-h-24 w-full rounded-field bg-surface p-3 shadow-[inset_0_0_0_1.5px_var(--line-field)]" />
        </label>
        <div className="mt-4 text-[13px] font-bold text-ink-2">
          Responsible
          <div className="mt-2">
            <PeoplePicker aria-label="Responsible" value={owners} onChange={setOwners} suggestions={OWNERS} placeholder="Add a name" />
          </div>
        </div>
        <label className="mt-4 block text-[13px] font-bold text-ink-2">
          Key points
          <input className="mt-2 block h-[46px] w-full rounded-field bg-surface px-3 shadow-[inset_0_0_0_1.5px_var(--line-field)]" />
        </label>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="mt-4 text-[13px] text-muted">
            The body scrolls on its own when it is longer than the sheet.
          </p>
        ))}
      </Sheet>
      <Sheet open={overlay === "short"} onClose={() => setOverlay(null)} title="Quick capture" short>
        <label className="mt-3 flex items-center gap-2 text-[13px] font-bold text-ink-2">
          <Icon name="plus" />
          <input aria-label="Task" placeholder="Add a task" className="h-[46px] w-full rounded-field bg-surface px-3 shadow-[inset_0_0_0_1.5px_var(--line-field)]" />
        </label>
      </Sheet>
      <Sheet
        open={overlay === "details"}
        onClose={() => setOverlay(null)}
        title="Task details"
        footer={
          <>
            <Button variant="quietRed" onClick={() => setConfirmOpen(true)}>
              Delete
            </Button>
            <SheetSpacer />
            <Button onClick={() => setOverlay(null)}>Cancel</Button>
          </>
        }
      >
        <p className="mt-4 text-[14px] text-ink-2">A confirmation can sit on top of this sheet.</p>
      </Sheet>

      <Dialog
        open={overlay === "dialog"}
        onClose={() => setOverlay(null)}
        title="Move to a group"
        actions={
          <>
            <Button onClick={() => setOverlay(null)}>Cancel</Button>
            <Button variant="main" small onClick={() => setOverlay(null)}>
              Move
            </Button>
          </>
        }
      >
        Pick where this task goes. It keeps its dates and its people.
      </Dialog>
      <Confirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          setOverlay(null);
          setNote("Confirmed: Delete task");
        }}
        title="Delete this task?"
        confirmLabel="Delete task"
        quote="Call Pelita Foods about the trial"
      >
        It will be removed for everyone on the team.
      </Confirm>
    </>
  );
}
