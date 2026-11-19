import { addDaysToISO, getLocalDateISO } from '../../../shared/catalog';

export type PeriodPreset = 'all' | 'today' | '7d' | 'month' | 'custom';

export interface PeriodRange {
  preset: PeriodPreset;
  startDate: string;
  endDate: string;
}

export function computeRangeForPreset(preset: PeriodPreset): PeriodRange {
  const today = getLocalDateISO();
  switch (preset) {
    case 'today':
      return { preset, startDate: today, endDate: today };
    case '7d':
      return { preset, startDate: addDaysToISO(today, -6), endDate: today };
    case 'month': {
      const [year, month] = today.split('-');
      return { preset, startDate: `${year}-${month}-01`, endDate: today };
    }
    case 'custom':
      return { preset, startDate: today, endDate: today };
    case 'all':
    default:
      return { preset: 'all', startDate: '', endDate: '' };
  }
}

interface PeriodFilterBarProps {
  value: PeriodRange;
  onChange: (next: PeriodRange) => void;
}

const PRESET_OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'all', label: 'Todo período' },
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'custom', label: 'Personalizado' },
];

export function PeriodFilterBar({ value, onChange }: PeriodFilterBarProps) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:flex-wrap">
      <div className="flex items-center gap-1 p-1 bg-brand-soft rounded-xl overflow-x-auto">
        {PRESET_OPTIONS.map((opt) => {
          const active = value.preset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(computeRangeForPreset(opt.id))}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'tab-active'
                  : 'tab-idle'
              }`} aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span>De</span>
            <input
              type="date"
              value={value.startDate}
              onChange={(e) => onChange({ ...value, startDate: e.target.value })}
              className="min-h-[44px] px-2.5 py-1.5 border rounded-lg field-control text-base"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span>Até</span>
            <input
              type="date"
              value={value.endDate}
              onChange={(e) => onChange({ ...value, endDate: e.target.value })}
              className="min-h-[44px] px-2.5 py-1.5 border rounded-lg field-control text-base"
            />
          </label>
        </div>
      )}
    </div>
  );
}
