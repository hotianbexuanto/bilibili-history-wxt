import dayjs from "dayjs";
import { HistoryItem } from "./types/index";

export interface DateGroup {
  dateKey: string; // YYYY-MM-DD
  label: string;
  items: HistoryItem[];
}

export function formatDateLabel(dateKey: string): string {
  const date = dayjs(dateKey);
  const now = dayjs();
  const dayOfWeek = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.day()];

  if (date.isSame(now, "day")) {
    return `今天 · ${date.format("M月D日")} ${dayOfWeek}`;
  }
  if (date.isSame(now.subtract(1, "day"), "day")) {
    return `昨天 · ${date.format("M月D日")} ${dayOfWeek}`;
  }
  if (date.isSame(now, "year")) {
    return `${date.format("M月D日")} ${dayOfWeek}`;
  }
  return `${date.format("YYYY年M月D日")} ${dayOfWeek}`;
}

export function groupByDate(items: HistoryItem[]): DateGroup[] {
  const map = new Map<string, HistoryItem[]>();

  for (const item of items) {
    const dateKey = dayjs(item.view_at * 1000).format("YYYY-MM-DD");
    const group = map.get(dateKey);
    if (group) {
      group.push(item);
    } else {
      map.set(dateKey, [item]);
    }
  }

  return Array.from(map.entries())
    .sort(([dateKeyA], [dateKeyB]) => dateKeyB.localeCompare(dateKeyA))
    .map(([dateKey, groupItems]) => ({
      dateKey,
      label: formatDateLabel(dateKey),
      items: groupItems,
    }));
}
