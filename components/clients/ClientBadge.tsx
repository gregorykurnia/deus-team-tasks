import { FieldOption } from "@/lib/clientTypes";

export function ClientBadge({
  label,
  option,
  onClick,
}: {
  label: string;
  option: FieldOption | null;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (!label) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        <span className="text-[9px]">▾</span> —
      </button>
    );
  }
  const style = option ? { background: option.bg, color: option.color } : { background: "#F2F4F8", color: "#5A6278" };
  return (
    <button
      onClick={onClick}
      style={style}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap hover:brightness-95 transition-[filter]"
    >
      {label}
      <span className="opacity-50 text-[9px]">▾</span>
    </button>
  );
}
