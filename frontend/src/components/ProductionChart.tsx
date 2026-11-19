import { formatBRL, formatDateBR } from '../../../shared/catalog';
import type { DailyMetricPoint } from '../../../shared/panelTypes';

interface ProductionChartProps {
  points: DailyMetricPoint[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  title?: string;
  commissionLabel?: string;
}

function formatShortDay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function ProductionChart({
  points,
  selectedDate,
  onSelectDate,
  title = 'Produção e comissão por dia (últimos 7 dias)',
  commissionLabel = 'Comissão 25%',
}: ProductionChartProps) {
  const maxVal = Math.max(
    100,
    ...points.map((p) => Math.max(p.totalProduced, p.commissionAmount))
  );

  return (
    <div className="bg-white border border-[#F1D8E2] rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F5E4EC]">
        <div>
          <h3 className="text-base font-semibold text-[#331824]">{title}</h3>
          <p className="text-xs text-[#7A5464]">
            Toque em uma data para consultar os atendimentos do dia
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-[#5E3A4A]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#9D2A58]" />
            <span>Produção</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#E8A4BF]" />
            <span>{commissionLabel}</span>
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-3 items-end">
        {points.map((point) => {
          const isSelected = point.date === selectedDate;
          const prodPct = Math.round((point.totalProduced / maxVal) * 100);
          const commPct = Math.round((point.commissionAmount / maxVal) * 100);
          const prodHeight = point.totalProduced > 0 ? Math.max(8, prodPct) : 2;
          const commHeight = point.commissionAmount > 0 ? Math.max(6, commPct) : 0;

          return (
            <button
              key={point.date}
              type="button"
              onClick={() => onSelectDate(point.date)}
              title={`${formatDateBR(point.date)}: Produzido ${formatBRL(point.totalProduced)} | ${commissionLabel} ${formatBRL(point.commissionAmount)}`}
              className={`group flex flex-col items-center p-1.5 sm:p-2 rounded-xl border transition-colors ${
                isSelected
                  ? 'bg-[#FDF2F6] border-[#9D2A58]'
                  : 'bg-transparent border-transparent hover:bg-[#FFF9FB] hover:border-[#F1D8E2]'
              }`}
            >
              <div className="w-full h-36 sm:h-44 flex items-end justify-center gap-1 sm:gap-1.5">
                <div
                  className="w-3.5 sm:w-5 rounded-t-md bg-[#9D2A58] transition-all"
                  style={{ height: `${prodHeight}%` }}
                />
                {point.commissionAmount > 0 && (
                  <div
                    className="w-3 sm:w-4 rounded-t-md bg-[#E8A4BF] transition-all"
                    style={{ height: `${commHeight}%` }}
                  />
                )}
              </div>

              <div className="mt-2 text-center">
                <span
                  className={`block text-[11px] sm:text-xs font-semibold tabular-nums ${
                    isSelected ? 'text-[#831843]' : 'text-[#4D2939]'
                  }`}
                >
                  {formatShortDay(point.date)}
                </span>
                <span className="hidden sm:block text-[10px] text-[#7A5464] tabular-nums mt-0.5">
                  {point.totalProduced > 0 ? formatBRL(point.totalProduced) : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
