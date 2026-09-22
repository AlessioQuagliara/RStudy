import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  tourId?: string;
}

export function Tabs({
  items,
  active,
  onChange,
  tourId,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  tourId?: string;
}) {
  return (
    <div role="tablist" className="tabs tabs-lift col-span-12" data-tour={tourId}>
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          type="button"
          aria-selected={active === item.key}
          data-tour={item.tourId}
          className={cn("tab", active === item.key && "tab-active")}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
