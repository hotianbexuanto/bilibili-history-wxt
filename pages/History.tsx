import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { HistoryItem } from "../components/HistoryItem";
import {
  getFilteredHistoryCount,
  getHistory,
  getHistoryDateSummary,
  getHistoryFromViewAt,
  getHistoryNewerThan,
  HistoryDateSummaryItem,
} from "../utils/db";
import { HistoryItem as HistoryItemType } from "../utils/types";
import { useDebounce } from "use-debounce";
import { RefreshCwIcon, ChevronDownIcon, Search, X, Filter, Minus, Plus } from "lucide-react";
import { DATE_SELECTION_MODE, GRID_COLUMNS } from "../utils/constants";
import { DateRangePicker } from "../components/DateRangePicker";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { isSidepanel } from "../utils/isSidepanel";
import { groupByDate } from "../utils/dateGroup";
import dayjs from "dayjs";
import { MiniTimeline } from "../components/MiniTimeline";

const SIDEPANEL_NAV_HEIGHT = 41;

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItemType[]>([]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(keyword, 500);

  // Date Range State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [searchType, setSearchType] = useState<"all" | "title" | "up" | "bvid" | "avid">("all");
  const [isSearchKindDropdownOpen, setIsSearchKindDropdownOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [timelineItems, setTimelineItems] = useState<HistoryDateSummaryItem[]>([]);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");
  const [gridColumns, setGridColumns] = useState(isSidepanel ? 1 : 4);
  const [toolbarHeight, setToolbarHeight] = useState(isSidepanel ? 120 : 96);
  const [sidepanelTimelineTopOffset, setSidepanelTimelineTopOffset] = useState(
    SIDEPANEL_NAV_HEIGHT + 120,
  );
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadPreviousRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const previousObserverRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const historyRef = useRef<HistoryItemType[]>([]);
  const hasMoreRef = useRef(true);
  const hasNewerRef = useRef(false);
  const [activeDateKey, setActiveDateKey] = useState("");
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const headerObserverRef = useRef<IntersectionObserver | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pendingTimelineJumpRef = useRef<string | null>(null);
  const isTimelineJumpingRef = useRef(false);

  const dateGroups = useMemo(() => groupByDate(history), [history]);
  const stickyToolbarTop = isSidepanel ? SIDEPANEL_NAV_HEIGHT : 0;
  const timelineTopOffset = isSidepanel ? sidepanelTimelineTopOffset : toolbarHeight;
  const groupHeaderTopOffset = isSidepanel ? 0 : timelineTopOffset;

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const handleScrollToTopRequest = () => {
      pendingTimelineJumpRef.current = null;
      isTimelineJumpingRef.current = false;
      setIsTimelineLoading(false);
      setHasNewer(false);
      hasNewerRef.current = false;
      setHasMore(true);
      hasMoreRef.current = true;
      void loadHistoryRef.current(false);
    };

    window.addEventListener("history:scroll-to-top-request", handleScrollToTopRequest);
    return () => {
      window.removeEventListener("history:scroll-to-top-request", handleScrollToTopRequest);
    };
  }, []);

  useEffect(() => {
    hasNewerRef.current = hasNewer;
  }, [hasNewer]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateToolbarHeight = () => {
      setToolbarHeight(toolbar.offsetHeight);

      if (isSidepanel) {
        const toolbarBottom = toolbar.getBoundingClientRect().bottom;
        setSidepanelTimelineTopOffset(Math.max(SIDEPANEL_NAV_HEIGHT, Math.round(toolbarBottom)));
      }
    };

    updateToolbarHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateToolbarHeight();
    });

    resizeObserver.observe(toolbar);
    window.addEventListener("resize", updateToolbarHeight);
    window.addEventListener("scroll", updateToolbarHeight, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateToolbarHeight);
      window.removeEventListener("scroll", updateToolbarHeight);
    };
  }, [isSidepanel]);

  useEffect(() => {
    getStorageValue(DATE_SELECTION_MODE, "range").then((mode) => {
      setDateSelectionMode(mode as "range" | "single");
    });
    getStorageValue<number>(GRID_COLUMNS, 4).then((cols) => {
      setGridColumns(isSidepanel ? Math.min(cols, 2) : cols);
    });
  }, []);

  const handleColumnChange = (delta: number) => {
    setGridColumns((prev) => {
      const next = Math.max(2, Math.min(8, prev + delta));
      setStorageValue(GRID_COLUMNS, next);
      return next;
    });
  };

  const typeOptions = [
    { value: "all", label: "全部分类" },
    { value: "archive", label: "视频" },
    { value: "live", label: "直播" },
    { value: "pgc", label: "番剧" },
    { value: "article", label: "专栏" },
    { value: "cheese", label: "课堂" },
  ];

  const loadHistory = async (isAppend: boolean = false) => {
    if (isAppend && isLoadingRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      isLoadingRef.current = true;

      let lastViewTime: number | "" = "";
      if (isAppend && historyRef.current.length > 0) {
        lastViewTime = historyRef.current[historyRef.current.length - 1].view_at;
      }

      const { items, hasMore } = await getHistory(
        lastViewTime,
        100,
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
      );

      if (isAppend) {
        setHistory((prev) => [...prev, ...items]);
      } else {
        setHistory(items);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setHasNewer(false);
        hasNewerRef.current = false;
      }

      setHasMore(hasMore);
      hasMoreRef.current = hasMore;
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // 保持最新的 loadHistory 引用，避免 Observer 闭包陈旧
  const loadHistoryRef = useRef(loadHistory);
  loadHistoryRef.current = loadHistory;

  useEffect(() => {
    loadHistory(false);
    loadTimelineSummary();
    getFilteredCount();
  }, [debouncedKeyword, startDate, endDate, selectedType, searchType]);

  const getFilteredCount = async () => {
    const count = await getFilteredHistoryCount(
      debouncedKeyword,
      { start: startDate, end: endDate },
      selectedType,
      searchType,
    );
    setTotalHistoryCount(count);
  };

  const loadTimelineSummary = async () => {
    try {
      const summary = await getHistoryDateSummary(
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
      );
      setTimelineItems(summary);
      setActiveDateKey((prev) => {
        if (summary.length === 0) return "";
        if (prev && summary.some((item) => item.dateKey === prev)) return prev;
        return summary[0].dateKey;
      });
    } catch (error) {
      console.error("Failed to load timeline summary:", error);
      setTimelineItems([]);
    }
  };

  // Observer 只创建一次，通过 ref 访问最新状态
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          loadHistoryRef.current(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "200px",
      },
    );

    // callback ref 在 useEffect 之前执行，此时 loadMoreRef.current 可能已有值
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    previousObserverRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNewerRef.current && !isLoadingRef.current) {
          void loadPreviousHistory();
        }
      },
      {
        threshold: 0.1,
        rootMargin: "200px",
      },
    );

    if (loadPreviousRef.current) {
      previousObserverRef.current.observe(loadPreviousRef.current);
    }

    return () => {
      previousObserverRef.current?.disconnect();
    };
  }, []);

  // callback ref：loadMore div 挂载/卸载时自动 observe/unobserve
  const loadMoreCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (loadMoreRef.current && observerRef.current) {
      observerRef.current.unobserve(loadMoreRef.current);
    }
    loadMoreRef.current = node;
    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  const loadPreviousCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (loadPreviousRef.current && previousObserverRef.current) {
      previousObserverRef.current.unobserve(loadPreviousRef.current);
    }
    loadPreviousRef.current = node;
    if (node && previousObserverRef.current) {
      previousObserverRef.current.observe(node);
    }
  }, []);

  const loadPreviousHistory = async () => {
    if (isLoadingRef.current || !hasNewerRef.current || historyRef.current.length === 0) {
      return;
    }

    const firstVisibleItem = historyRef.current[0];
    if (!firstVisibleItem) return;

    try {
      setIsLoading(true);
      isLoadingRef.current = true;

      const previousScrollHeight = document.documentElement.scrollHeight;
      const previousScrollTop = window.scrollY;

      const response = await getHistoryNewerThan(
        firstVisibleItem.view_at,
        40,
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
      );

      if (response.items.length > 0) {
        setHistory((prev) => {
          const next = [...response.items, ...prev].filter(
            (item, index, items) =>
              index === items.findIndex((candidate) => candidate.id === item.id),
          );
          historyRef.current = next;
          return next;
        });

        requestAnimationFrame(() => {
          const nextScrollHeight = document.documentElement.scrollHeight;
          window.scrollTo({ top: previousScrollTop + (nextScrollHeight - previousScrollHeight) });
        });
      }

      setHasNewer(response.hasMore);
      hasNewerRef.current = response.hasMore;
    } catch (error) {
      console.error("Failed to load previous history:", error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // 跟踪当前可视区域的日期分组
  useEffect(() => {
    headerObserverRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const dateKey = (entry.target as HTMLElement).dataset.dateKey;
            if (dateKey) setActiveDateKey(dateKey);
          }
        }
      },
      { rootMargin: "-60px 0px -80% 0px", threshold: 0 },
    );

    return () => {
      headerObserverRef.current?.disconnect();
    };
  }, []);

  // 注册/注销日期分组 header 的观察
  const groupHeaderRef = useCallback((dateKey: string, node: HTMLDivElement | null) => {
    if (node) {
      groupRefs.current.set(dateKey, node);
      headerObserverRef.current?.observe(node);
    } else {
      const prev = groupRefs.current.get(dateKey);
      if (prev) headerObserverRef.current?.unobserve(prev);
      groupRefs.current.delete(dateKey);
    }
  }, []);

  useEffect(() => {
    const pendingDateKey = pendingTimelineJumpRef.current;
    if (!pendingDateKey) return;

    const targetElement = groupRefs.current.get(pendingDateKey);
    if (!targetElement) return;

    pendingTimelineJumpRef.current = null;
    requestAnimationFrame(() => {
      const topOffset = isSidepanel ? SIDEPANEL_NAV_HEIGHT : timelineTopOffset;
      const targetTop = targetElement.getBoundingClientRect().top + window.scrollY - topOffset;

      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    });
  }, [dateGroups, isSidepanel, timelineTopOffset]);

  const handleTimelineClick = useCallback(
    (dateKey: string) => {
      const scrollToDate = async () => {
        setActiveDateKey(dateKey);

        let targetElement = groupRefs.current.get(dateKey);
        if (targetElement) {
          const topOffset = isSidepanel ? SIDEPANEL_NAV_HEIGHT : timelineTopOffset;
          const targetTop = targetElement.getBoundingClientRect().top + window.scrollY - topOffset;

          window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: "smooth",
          });
          return;
        }

        if (isTimelineJumpingRef.current) {
          pendingTimelineJumpRef.current = dateKey;
          return;
        }

        const summary = timelineItems.find((item) => item.dateKey === dateKey);
        if (!summary) {
          return;
        }

        pendingTimelineJumpRef.current = dateKey;
        isTimelineJumpingRef.current = true;
        setIsTimelineLoading(true);

        try {
          const pageSize = 100;
          const newerPageSize = Math.max(20, Math.floor(pageSize * 0.35));
          const olderPageSize = pageSize - newerPageSize;
          const [newerResponse, olderResponse] = await Promise.all([
            getHistoryNewerThan(
              summary.latestViewAt,
              newerPageSize,
              debouncedKeyword,
              { start: startDate, end: endDate },
              selectedType,
              searchType,
            ),
            getHistoryFromViewAt(
              summary.latestViewAt,
              olderPageSize,
              debouncedKeyword,
              { start: startDate, end: endDate },
              selectedType,
              searchType,
            ),
          ]);

          const mergedItems = [...newerResponse.items, ...olderResponse.items].filter(
            (item, index, items) =>
              index === items.findIndex((candidate) => candidate.id === item.id),
          );

          setHistory(mergedItems);
          historyRef.current = mergedItems;
          setHasNewer(newerResponse.hasMore);
          hasNewerRef.current = newerResponse.hasMore;
          setHasMore(olderResponse.hasMore);
          hasMoreRef.current = olderResponse.hasMore;

          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });

          targetElement = groupRefs.current.get(dateKey);
          if (targetElement) {
            pendingTimelineJumpRef.current = null;
            const topOffset = isSidepanel ? SIDEPANEL_NAV_HEIGHT : timelineTopOffset;
            const targetTop =
              targetElement.getBoundingClientRect().top + window.scrollY - topOffset;

            window.scrollTo({
              top: Math.max(0, targetTop),
              behavior: "smooth",
            });
          }
        } finally {
          isTimelineJumpingRef.current = false;
          setIsTimelineLoading(false);
        }
      };

      void scrollToDate();
    },
    [
      debouncedKeyword,
      isSidepanel,
      searchType,
      selectedType,
      startDate,
      timelineItems,
      timelineTopOffset,
    ],
  );

  const handleDelete = useCallback((item: HistoryItemType) => {
    const itemDateKey = dayjs(item.view_at * 1000).format("YYYY-MM-DD");

    setHistory((prev) => prev.filter((historyItem) => historyItem.id !== item.id));
    setTotalHistoryCount((prev) => Math.max(0, prev - 1));
    setTimelineItems((prev) => {
      const next = prev
        .map((timelineItem) =>
          timelineItem.dateKey === itemDateKey
            ? { ...timelineItem, count: timelineItem.count - 1 }
            : timelineItem,
        )
        .filter((timelineItem) => timelineItem.count > 0);

      setActiveDateKey((currentActiveDateKey) => {
        if (next.length === 0) return "";
        if (currentActiveDateKey !== itemDateKey) return currentActiveDateKey;
        return next.some((timelineItem) => timelineItem.dateKey === currentActiveDateKey)
          ? currentActiveDateKey
          : next[0].dateKey;
      });

      return next;
    });
  }, []);

  const getLoadMoreText = () => {
    if (history.length === 0) {
      return keyword.trim() ? "没有找到匹配的历史记录" : "暂无历史记录";
    }
    return isLoading ? "加载中..." : hasMore ? "向下滚动加载更多" : "没有更多了";
  };

  return (
    <div className={isSidepanel ? "pb-4" : ""}>
      <div
        ref={toolbarRef}
        className={`${isSidepanel ? "relative" : "sticky"} bg-white/95 backdrop-blur-sm z-20 border-b border-gray-100 shadow-sm transition-all duration-300`}
        style={isSidepanel ? undefined : { top: `${stickyToolbarTop}px` }}
      >
        <div
          className={`flex items-center justify-between gap-3 max-w-[1600px] mx-auto ${
            isSidepanel ? "flex-col px-3 py-3" : "flex-col md:flex-row px-6 py-4 gap-4"
          }`}
        >
          {/* 左侧：统计与筛选 */}
          <div
            className={`flex items-center gap-3 ${isSidepanel ? "w-full justify-between" : "w-full md:w-auto"}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full whitespace-nowrap border border-gray-100">
                {totalHistoryCount} 条记录
              </span>
              {isTimelineLoading && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full whitespace-nowrap border border-blue-100">
                  时间跳转中...
                </span>
              )}
            </div>

            <div className="relative">
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors border border-gray-200/50"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              >
                <Filter className="w-3.5 h-3.5 text-gray-500" />
                <span>{typeOptions.find((opt) => opt.value === selectedType)?.label}</span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {isTypeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsTypeDropdownOpen(false)}
                  ></div>
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                    {typeOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          selectedType === option.value
                            ? "bg-blue-50 text-blue-600 font-medium"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          setSelectedType(option.value);
                          setIsTypeDropdownOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 中间：搜索框 (带类型选择) */}
          <div className={`flex-1 w-full ${isSidepanel ? "" : "md:max-w-xl px-4"}`}>
            <div className="relative group w-full flex items-center bg-gray-50 border border-gray-200 rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400">
              {/* 搜索类型下拉 */}
              <div className="relative">
                <button
                  className="pl-4 pr-3 py-2 text-sm text-gray-600 font-medium cursor-pointer border-r border-gray-200 hover:text-blue-600 flex items-center gap-1 transition-colors whitespace-nowrap"
                  onClick={() => setIsSearchKindDropdownOpen(!isSearchKindDropdownOpen)}
                >
                  <span>
                    {searchType === "all" && "综合"}
                    {searchType === "title" && "标题"}
                    {searchType === "up" && "UP主"}
                    {searchType === "bvid" && "BV号"}
                    {searchType === "avid" && "AV号"}
                  </span>
                  <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                </button>

                {isSearchKindDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsSearchKindDropdownOpen(false)}
                    ></div>
                    <div className="absolute top-full left-0 mt-2 w-28 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                      {[
                        { value: "all", label: "综合搜索" },
                        { value: "title", label: "视频标题" },
                        { value: "up", label: "UP主" },
                        { value: "bvid", label: "视频BV号" },
                        { value: "avid", label: "视频AV号" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            searchType === option.value
                              ? "bg-blue-50 text-blue-600 font-medium"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                          onClick={() => {
                            setSearchType(option.value as any);
                            setIsSearchKindDropdownOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <input
                type="text"
                className="flex-1 bg-transparent border-none focus:ring-0 pl-3 pr-10 py-2 text-sm placeholder-gray-400 focus:outline-none"
                placeholder={
                  searchType === "bvid"
                    ? "输入BV号..."
                    : searchType === "avid"
                      ? "输入AV号..."
                      : searchType === "up"
                        ? "输入UP主名称或UID..."
                        : "搜索..."
                }
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />

              {keyword ? (
                <button
                  onClick={() => setKeyword("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          {/* 右侧：日期、列数与刷新 */}
          <div
            className={`flex items-center gap-3 w-full ${
              isSidepanel ? "justify-between" : "md:w-auto justify-end"
            }`}
          >
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              mode={dateSelectionMode}
              compact={isSidepanel}
            />

            {/* 列数调节 */}
            {!isSidepanel && (
              <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-1 py-0.5">
                <button
                  onClick={() => handleColumnChange(-1)}
                  disabled={gridColumns <= 2}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="减少列数"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-gray-600 text-center tabular-nums whitespace-nowrap">
                  列数({gridColumns})
                </span>
                <button
                  onClick={() => handleColumnChange(1)}
                  disabled={gridColumns >= 8}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="增加列数"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              onClick={() => {
                loadHistory(false);
                loadTimelineSummary();
                getFilteredCount();
              }}
              className={`p-2 bg-white text-gray-500 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm border border-gray-200 hover:border-blue-200 hover:rotate-180 duration-500 ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isLoading}
              title="刷新"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 时间线 + 内容区域 */}
      <div className="relative">
        {timelineItems.length > 0 && (
          <MiniTimeline
            items={timelineItems}
            activeDateKey={activeDateKey}
            onDateClick={handleTimelineClick}
            topOffset={timelineTopOffset}
          />
        )}

        <div className={isSidepanel ? "pr-12" : "pr-16"}>
          <div ref={loadPreviousCallbackRef} className="h-1" />
          {dateGroups.map((group) => (
            <div key={group.dateKey}>
              <div
                ref={(node) => groupHeaderRef(group.dateKey, node)}
                data-date-key={group.dateKey}
                className="sticky bg-white/95 backdrop-blur-sm z-10 px-6 py-2 border-b border-gray-100"
                style={{ top: `${groupHeaderTopOffset}px` }}
              >
                <span className="text-sm font-semibold text-gray-700">{group.label}</span>
                <span className="text-xs text-gray-400 ml-2">{group.items.length} 条</span>
              </div>
              <div
                className="p-6 pt-2 grid gap-5 mx-auto w-full"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                }}
              >
                {group.items.map((item) => (
                  <HistoryItem
                    key={`${item.id}-${item.view_at}`}
                    item={item}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div ref={loadMoreCallbackRef} className="py-8 text-center text-gray-500 text-sm">
          {getLoadMoreText()}
        </div>
      </div>

      {history.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <div className="text-gray-300 mb-4">
            <Search className="w-16 h-16 mx-auto opacity-50" />
          </div>
          <p className="text-gray-500 text-lg">
            {keyword || startDate || selectedType !== "all" || searchType !== "all"
              ? "没有找到相关记录"
              : "暂无历史记录"}
          </p>
          {(keyword || startDate || selectedType !== "all" || searchType !== "all") && (
            <button
              onClick={() => {
                setKeyword("");
                setStartDate("");
                setEndDate("");
                setSelectedType("all");
                setSearchType("all");
              }}
              className="mt-4 text-blue-500 hover:text-blue-600 hover:underline text-sm"
            >
              清除所有筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
};
