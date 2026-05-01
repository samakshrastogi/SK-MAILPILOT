import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from "react-icons/fi";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
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

  return (
    <div className="flex justify-end w-full">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/80 backdrop-blur border border-gray-200 shadow-sm">

        {/* First */}
        <button
          disabled={!canGoPrev}
          onClick={() => onPageChange(1)}
          className={`p-2 rounded-lg transition ${
            canGoPrev
              ? "hover:bg-gray-200 text-gray-700"
              : "text-gray-400 cursor-not-allowed"
          }`}
        >
          <FiChevronsLeft />
        </button>

        {/* Previous */}
        <button
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          className={`p-2 rounded-lg transition ${
            canGoPrev
              ? "hover:bg-gray-200 text-gray-700"
              : "text-gray-400 cursor-not-allowed"
          }`}
        >
          <FiChevronLeft />
        </button>

        {/* Pages */}
        <div className="flex items-center gap-1">
          {pages.map((p, idx) =>
            typeof p === "string" ? (
              <span key={idx} className="px-2 text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={`${p}-${idx}`}
                onClick={() => onPageChange(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
                  ${
                    p === page
                      ? "bg-gray-900 text-white shadow"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className={`p-2 rounded-lg transition ${
            canGoNext
              ? "hover:bg-gray-200 text-gray-700"
              : "text-gray-400 cursor-not-allowed"
          }`}
        >
          <FiChevronRight />
        </button>

        {/* Last */}
        <button
          disabled={!canGoNext}
          onClick={() => onPageChange(totalPages)}
          className={`p-2 rounded-lg transition ${
            canGoNext
              ? "hover:bg-gray-200 text-gray-700"
              : "text-gray-400 cursor-not-allowed"
          }`}
        >
          <FiChevronsRight />
        </button>
      </div>
    </div>
  );
}
