import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from "react-icons/fi";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const getPages = () => {
    const pages: (number | string)[] = [];
    const delta = 2;

    const rangeStart = Math.max(2, page - delta);
    const rangeEnd = Math.min(totalPages - 1, page + delta);

    pages.push(1);

    if (rangeStart > 2) pages.push("...");

    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    if (rangeEnd < totalPages - 1) pages.push("...");

    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const pages = getPages();
  const navButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white";

  return (
    <div className="w-full">
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
          >
            <FiChevronLeft />
            Previous
          </button>

          <div className="flex h-11 min-w-[92px] items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
            {page} / {totalPages}
          </div>

          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
          >
            Next
            <FiChevronRight />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => onPageChange(1)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-slate-50"
          >
            <FiChevronsLeft />
            First
          </button>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => onPageChange(totalPages)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-slate-50"
          >
            Last
            <FiChevronsRight />
          </button>
        </div>
      </div>

      <div className="hidden justify-end sm:flex">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">

        {/* First */}
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(1)}
          className={navButtonClass}
          title="First page"
        >
          <FiChevronsLeft />
        </button>

        {/* Previous */}
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          className={navButtonClass}
          title="Previous page"
        >
          <FiChevronLeft />
        </button>

        {/* Pages */}
        <div className="flex items-center gap-1 px-1">
          {pages.map((p, idx) =>
            typeof p === "string" ? (
              <span key={idx} className="px-2 text-slate-400">
                ...
              </span>
            ) : (
              <button
                type="button"
                key={`${p}-${idx}`}
                onClick={() => onPageChange(p)}
                className={`h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition
                  ${
                    p === page
                      ? "bg-slate-900 text-white shadow"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className={navButtonClass}
          title="Next page"
        >
          <FiChevronRight />
        </button>

        {/* Last */}
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(totalPages)}
          className={navButtonClass}
          title="Last page"
        >
          <FiChevronsRight />
        </button>
        </div>
      </div>
    </div>
  );
}
