"use client";

import { useEffect, useState } from "react";
import { FieldOptionsMap, PipelineEntry, TableKey } from "@/lib/clientTypes";

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; bg: string; color: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-white"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.label} value={o.label}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const inputClass =
  "w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";
const textareaClass =
  "w-full text-[13px] border border-gray-200 rounded-md px-2.5 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-y";
const labelClass = "block text-xs font-medium text-gray-600 mb-1";

export function ClientEntryModal({
  kind,
  editing,
  prefill,
  fieldOptions,
  onSave,
  onClose,
}: {
  kind: TableKey;
  editing: PipelineEntry | null;
  prefill: Partial<PipelineEntry> | null;
  fieldOptions: FieldOptionsMap;
  onSave: (entry: Partial<PipelineEntry>) => void;
  onClose: () => void;
}) {
  const source = editing ?? prefill ?? {};
  const [company, setCompany] = useState(source.company ?? "");
  const [pic, setPic] = useState(source.pic ?? "");
  const [date, setDate] = useState(source.date ?? (kind === "main" && !editing && !prefill ? new Date().toISOString().slice(0, 10) : ""));
  const [status, setStatus] = useState(source.status ?? "");
  const [type, setType] = useState(source.type ?? "");
  const [product, setProduct] = useState(source.product ?? "");
  const [priority, setPriority] = useState(source.priority ?? "");
  const [sourcing, setSourcing] = useState(source.sourcing ?? "");
  const [industry, setIndustry] = useState(source.industry ?? "");
  const [notes, setNotes] = useState(source.notes ?? "");
  const [target, setTarget] = useState(source.target ?? "");
  const [reach, setReach] = useState(source.reach ?? "");
  const [reason, setReason] = useState(source.reason ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isMove = !editing && !!prefill;
  const titles: Record<TableKey, { add: string; edit: string; move: string }> = {
    main: { add: "Add prospect", edit: "Edit entry", move: "Move to pipeline" },
    raw: { add: "Add to raw list", edit: "Edit raw list entry", move: "Move to raw list" },
    hold: { add: "Add to Hold / Reject", edit: "Edit entry", move: "Move to Hold / Reject" },
  };
  const title = isMove ? titles[kind].move : editing ? titles[kind].edit : titles[kind].add;

  function save() {
    if (!company.trim()) {
      alert("Company name is required.");
      return;
    }
    if (kind === "main") {
      onSave({ company: company.trim(), pic: pic.trim(), date, status, type, product, priority, sourcing: sourcing.trim(), industry, notes: notes.trim(), target, _raw: false, _hold: false });
    } else if (kind === "raw") {
      onSave({ company: company.trim(), type, reach, priority, industry, sourcing: sourcing.trim(), notes: notes.trim(), _raw: true, _hold: false });
    } else {
      onSave({ company: company.trim(), type, product: product.trim(), reason: reason.trim(), _raw: false, _hold: true });
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/45 z-[200] flex items-center justify-center p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
            ✕
          </button>
        </div>

        {kind === "main" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>
                  Company name <span className="text-accent">*</span>
                </label>
                <input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="PT Contoh Indonesia" className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Company PIC</label>
                <input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Budi Santoso" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Last action date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>
                  Status <span className="text-accent">*</span>
                </label>
                <Select value={status} onChange={setStatus} options={fieldOptions.status ?? []} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Interested product</label>
                <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Enhance, Discover, Potentia..." className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Type</label>
                <Select value={type} onChange={setType} options={fieldOptions.type ?? []} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Priority</label>
                <Select value={priority} onChange={setPriority} options={fieldOptions.priority ?? []} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Prospect sourcing</label>
                <input value={sourcing} onChange={(e) => setSourcing(e.target.value)} placeholder="e.g. Referral, Cold outreach" className={inputClass} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelClass}>Company industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Banking, Technology, Education..." className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Next actions</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Send proposal by Friday..." className={textareaClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Target date — next action</label>
                <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
              </div>
            </div>
          </>
        )}

        {kind === "raw" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>
                  Company name <span className="text-accent">*</span>
                </label>
                <input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="PT Contoh Indonesia" className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Type</label>
                <Select value={type} onChange={setType} options={fieldOptions.type ?? []} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Planned reach out date</label>
                <input type="date" value={reach} onChange={(e) => setReach(e.target.value)} className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Priority</label>
                <Select value={priority} onChange={setPriority} options={fieldOptions.priority ?? []} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>Industry</label>
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Banking, Technology..." className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Sourcing</label>
                <input value={sourcing} onChange={(e) => setSourcing(e.target.value)} placeholder="e.g. Referral, Network..." className={inputClass} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelClass}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any context or notes about this lead..." className={textareaClass} />
            </div>
          </>
        )}

        {kind === "hold" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="mb-3.5">
                <label className={labelClass}>
                  Company name <span className="text-accent">*</span>
                </label>
                <input autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="PT Contoh Indonesia" className={inputClass} />
              </div>
              <div className="mb-3.5">
                <label className={labelClass}>Type</label>
                <Select value={type} onChange={setType} options={fieldOptions.type ?? []} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelClass}>Product offered</label>
              <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Enhance, Discover, Potentia..." className={inputClass} />
            </div>
            <div className="mb-3.5">
              <label className={labelClass}>Reason for Rejection / Hold</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Budget not ready, wrong timing, not a fit..." className={textareaClass} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-200">
          <button onClick={onClose} className="h-9 px-4 rounded-md text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} className="h-9 px-4 rounded-md text-[13px] font-medium bg-accent text-white hover:opacity-90">
            ✓ Save entry
          </button>
        </div>
      </div>
    </div>
  );
}
