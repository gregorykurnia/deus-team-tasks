"use client";

import { FormEvent, useEffect, useState } from "react";
import { HistoricalClient } from "@/lib/historicalClientTypes";

const labelClass = "block text-xs font-medium text-gray-600 mb-1";
const inputClass =
  "w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-white";
const cancelClass = "h-9 px-3.5 rounded-md text-[13px] font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50";
const saveClass = "h-9 px-4 rounded-md text-[13px] font-medium bg-accent text-white hover:opacity-90 disabled:opacity-50";

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function HistoricalClientDialog({
  mode,
  parentName,
  sectorOptions,
  onSave,
  onClose,
}: {
  mode: "head" | "sub";
  parentName?: string;
  sectorOptions: string[];
  onSave: (values: { name: string; sector: string; countHead: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [countHead, setCountHead] = useState(true);
  const [saving, setSaving] = useState(false);
  const isHead = mode === "head";
  const canSave = name.trim().length > 0 && !saving;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await onSave({ name: name.trim(), sector: sector.trim(), countHead });
    setSaving(false);
  }

  return (
    <DialogShell title={isHead ? "Add client" : "Add subsidiary"} onClose={onClose}>
      <form onSubmit={submit}>
        {!isHead && parentName && (
          <p className="mb-4 text-xs text-gray-400">
            Under <span className="font-medium text-gray-600">{parentName}</span>
          </p>
        )}
        <div className="mb-3.5">
          <label className={labelClass}>
            Name <span className="text-accent">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isHead ? "PT Contoh Indonesia" : "Subsidiary name"}
            className={inputClass}
          />
        </div>
        {isHead && (
          <>
            <div className="mb-3.5">
              <label className={labelClass}>Sector</label>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                list="historical-sector-options"
                placeholder="e.g. Retail"
                className={inputClass}
              />
              <datalist id="historical-sector-options">
                {sectorOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
            <label className="flex items-start gap-2.5 text-[13px] text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={countHead}
                onChange={(e) => setCountHead(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                Count this client in the total
                <span className="block text-[11px] text-gray-400">
                  Turn off to keep it in the list without counting it. Its subsidiaries are still counted.
                </span>
              </span>
            </label>
          </>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className={saveClass}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function MoveClientDialog({
  sub,
  heads,
  onSave,
  onClose,
}: {
  sub: HistoricalClient;
  heads: HistoricalClient[];
  onSave: (headId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [headId, setHeadId] = useState(heads[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const canSave = heads.length > 0 && !!headId && !saving;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await onSave(headId);
    setSaving(false);
  }

  return (
    <DialogShell title="Move subsidiary" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="mb-4 text-sm text-gray-500">
          <span className="font-medium text-gray-900">{sub.name}</span> will move under a different client.
        </p>
        {heads.length === 0 ? (
          <p className="text-sm text-gray-400">There is no other client to move it to. Add another client first.</p>
        ) : (
          <div className="mb-3.5">
            <label className={labelClass}>Move under</label>
            <select value={headId} onChange={(e) => setHeadId(e.target.value)} className={inputClass}>
              {heads.map((head) => (
                <option key={head.id} value={head.id}>
                  {head.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={cancelClass}>
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className={saveClass}>
            {saving ? "Moving…" : "Move"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
