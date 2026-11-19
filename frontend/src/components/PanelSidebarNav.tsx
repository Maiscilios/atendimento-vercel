import { X, type LucideIcon } from 'lucide-react';

export interface SidebarNavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface PanelSidebarNavProps<T extends string> {
  items: Array<SidebarNavItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  isOpen: boolean;
  onClose: () => void;
  subtitle: string;
}

export function PanelSidebarNav<T extends string>({
  items,
  activeId,
  onSelect,
  isOpen,
  onClose,
  subtitle,
}: PanelSidebarNavProps<T>) {
  function handlePick(id: T) {
    onSelect(id);
    onClose();
  }

  const navList = (
    <nav aria-label="Menu principal" className="flex flex-col gap-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handlePick(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`w-full min-h-[46px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-left text-sm font-semibold transition-colors border ${
              active
                ? 'choice-selected shadow-xs'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-brand-soft hover:text-brand-strong'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                active
                  ? 'bg-brand-strong text-surface'
                  : 'bg-brand-soft text-brand'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop persistent vertical sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-22 bg-surface border border-border rounded-2xl p-3.5 space-y-3 shadow-xs">
          <div className="px-2 pb-2.5 border-b border-border">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-strong">
              Navegação
            </p>
            <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
          </div>
          {navList}
        </div>
      </aside>

      {/* Mobile & Tablet slide-over vertical drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className="fixed inset-0 bg-overlay/40 backdrop-blur-xs"
          />

          <aside className="relative z-10 w-72 max-w-[82vw] h-full bg-background border-r border-border shadow-dialog flex flex-col">
            <div className="px-4 h-16 border-b border-border bg-surface flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block font-display text-xl font-bold text-brand-strong leading-tight">
                  MAIS CÍLIOS
                </span>
                <span className="block text-[11px] text-text-secondary truncate">{subtitle}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar menu"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center btn-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 overflow-y-auto flex-1">{navList}</div>
          </aside>
        </div>
      )}
    </>
  );
}
