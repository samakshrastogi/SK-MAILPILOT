type StatCardProps = {
  label: string;
  value: string | number;
  tone?: "default" | "alert" | "success" | "warning";
  helper?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  trend?: number[]; // ✅ added (non-breaking)
};

/* ---------------------------------- */
/* Sparkline (lightweight SVG chart)  */
/* ---------------------------------- */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-20 h-10">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
        className="opacity-80"
      />
    </svg>
  );
}

/* ---------------------------------- */
/* Stat Card                          */
/* ---------------------------------- */
export function StatCard({
  label,
  value,
  tone = "default",
  helper,
  icon,
  onClick,
  trend,
}: StatCardProps) {
  const toneStyles = {
    default: {
      accent: "text-blue-600",
      soft: "bg-blue-50",
      ring: "group-hover:ring-blue-200",
      icon: "bg-blue-100 text-blue-600",
    },
    alert: {
      accent: "text-red-600",
      soft: "bg-red-50",
      ring: "group-hover:ring-red-200",
      icon: "bg-red-100 text-red-600",
    },
    success: {
      accent: "text-green-600",
      soft: "bg-green-50",
      ring: "group-hover:ring-green-200",
      icon: "bg-green-100 text-green-600",
    },
    warning: {
      accent: "text-amber-600",
      soft: "bg-amber-50",
      ring: "group-hover:ring-amber-200",
      icon: "bg-amber-100 text-amber-600",
    },
  };

  const style = toneStyles[tone];

  return (
    <article
      onClick={onClick}
      className={`group relative rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl 
        px-5 py-4 transition-all duration-200 shadow-sm
        hover:shadow-md hover:-translate-y-[2px] hover:ring-1 ${style.ring}
        ${onClick ? "cursor-pointer active:scale-[0.98]" : ""}
      `}
    >
      {/* subtle hover background */}
      <div
        className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition ${style.soft}`}
      />

      {/* CONTENT */}
      <div className="relative">
        {/* TOP ROW */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {label}
          </span>

          {icon && (
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${style.icon}`}
            >
              <div className="text-base">{icon}</div>
            </div>
          )}
        </div>

        {/* VALUE + HELPER + TREND */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <strong
              className={`text-2xl font-semibold tracking-tight ${style.accent}`}
            >
              {value}
            </strong>

            {helper && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                {helper}
              </div>
            )}
          </div>

          {trend && (
            <div className={`${style.accent}`}>
              <Sparkline data={trend} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}