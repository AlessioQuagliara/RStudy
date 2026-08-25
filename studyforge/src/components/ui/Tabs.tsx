import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="tabs tabs-lift col-span-12">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          type="button"
          aria-selected={active === item.key}
          className={cn("tab", active === item.key && "tab-active")}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
