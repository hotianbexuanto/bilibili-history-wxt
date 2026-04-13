import { useEffect, useRef } from "react";
import dayjs from "dayjs";
import { isSidepanel } from "../utils/isSidepanel";

export interface MiniTimelineItem {
  dateKey: string;
  count: number;
}

interface MiniTimelineProps {
  items: MiniTimelineItem[];
  activeDateKey: string;
  onDateClick: (dateKey: string) => void;
  topOffset?: number;
}

function formatTick(dateKey: string, compact: boolean): string {
  const d = dayjs(dateKey);
  if (compact) {
    return d.format("M/D");
  }
  return d.format("M月D日");
}

function getMonthLabel(dateKey: string): string {
  return dayjs(dateKey).format("YYYY年M月");
}

export const MiniTimeline = ({
  items,
  activeDateKey,
  onDateClick,
  topOffset = 60,
}: MiniTimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const compact = isSidepanel;

  // Scroll active tick into view
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const el = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [activeDateKey]);

  // Group dates by month for section headers
  let lastMonth = "";

  return (
    <div
      ref={containerRef}
      className={`fixed right-0 bottom-0 z-10 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-none ${
        compact ? "w-11" : "w-14"
      } bg-gradient-to-b from-white/95 via-white/88 to-white/80 backdrop-blur-sm border-l border-gray-100 shadow-[-8px_0_18px_rgba(15,23,42,0.05)]`}
      style={{
        top: `${topOffset}px`,
        paddingTop: compact ? "10px" : "12px",
        paddingBottom: "20px",
      }}
    >
      {items.map(({ dateKey, count }) => {
        const month = getMonthLabel(dateKey);
        const showMonth = month !== lastMonth;
        lastMonth = month;
        const isActive = dateKey === activeDateKey;

        return (
          <div key={dateKey} className="flex flex-col items-center">
            {showMonth && (
              <span
                className={`text-gray-400 font-medium mt-2 mb-1 ${compact ? "text-[8px]" : "text-[10px]"}`}
              >
                {dayjs(dateKey).format(compact ? "M月" : "YYYY/M")}
              </span>
            )}
            <button
              ref={isActive ? activeRef : undefined}
              onClick={() => onDateClick(dateKey)}
              className={`w-full text-center rounded-l-md py-1 transition-colors ${
                compact ? "text-[9px]" : "text-[10px]"
              } ${
                isActive
                  ? "text-[#00a1d6] font-bold bg-blue-50 shadow-[inset_2px_0_0_#00a1d6]"
                  : "text-gray-500 hover:text-[#00a1d6] hover:bg-slate-50"
              }`}
              title={`${dateKey} · ${count} 条`}
            >
              {formatTick(dateKey, compact)}
            </button>
          </div>
        );
      })}
    </div>
  );
};
