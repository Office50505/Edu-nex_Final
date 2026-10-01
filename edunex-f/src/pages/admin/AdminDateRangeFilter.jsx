import { useMemo, useState } from "react";
import { formatDate } from "./adminApi.js";

const DAY_MS = 86400000;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function toDateInput(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function sameDate(a, b) {
  return Boolean(a && b) && toDateInput(a) === toDateInput(b);
}

function isBetween(day, start, end) {
  if (!start || !end) return false;
  const time = new Date(`${toDateInput(day)}T12:00:00`).getTime();
  const low = new Date(`${start}T12:00:00`).getTime();
  const high = new Date(`${end}T12:00:00`).getTime();
  return time >= Math.min(low, high) && time <= Math.max(low, high);
}

function monthDays(baseDate) {
  const first = startOfMonth(baseDate);
  const startOffset = first.getDay();
  const firstCell = addDays(first, -startOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
}

function CalendarMonth({ month, range, onPick }) {
  const currentMonth = month.getMonth();
  return (
    <div className="date-calendar-month">
      <header>{monthLabel(month)}</header>
      <div className="date-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-calendar-grid">
        {monthDays(month).map((day) => {
          const dateValue = toDateInput(day);
          const isOutside = day.getMonth() !== currentMonth;
          const isStart = sameDate(day, range.startDate);
          const isEnd = sameDate(day, range.endDate);
          const inRange = isBetween(day, range.startDate, range.endDate);
          return (
            <button
              className={`date-calendar-day${isOutside ? " is-outside" : ""}${inRange ? " is-in-range" : ""}${isStart || isEnd ? " is-selected" : ""}`}
              key={dateValue}
              type="button"
              onClick={() => onPick(dateValue)}
              aria-pressed={isStart || isEnd}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function adminDatePresets(today = new Date()) {
  const now = new Date(today);
  const yesterday = addDays(now, -1);
  const last7 = addDays(now, -6);
  const last30 = addDays(now, -29);
  return {
    today: { label: "Today", startDate: toDateInput(now), endDate: toDateInput(now) },
    yesterday: { label: "Yesterday", startDate: toDateInput(yesterday), endDate: toDateInput(yesterday) },
    last7: { label: "Last 7 days", startDate: toDateInput(last7), endDate: toDateInput(now) },
    last30: { label: "Last 30 days", startDate: toDateInput(last30), endDate: toDateInput(now) },
    monthToDate: { label: "Month to date", startDate: toDateInput(startOfMonth(now)), endDate: toDateInput(now) },
    yearToDate: { label: "Year to date", startDate: toDateInput(startOfYear(now)), endDate: toDateInput(now) },
  };
}

export function defaultDateRange(preset = "today") {
  const presets = adminDatePresets();
  return { preset, ...(presets[preset] || presets.today) };
}

export function dateInRange(value, range) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  const start = range?.startDate ? new Date(`${range.startDate}T00:00:00`).getTime() : -Infinity;
  const end = range?.endDate ? new Date(`${range.endDate}T23:59:59.999`).getTime() : Infinity;
  return time >= start && time <= end;
}

export function AdminDateRangeFilter({ value, onChange, onApply, loading = false, label = "Date range", meta = "" }) {
  const presets = useMemo(() => adminDatePresets(), []);
  const [open, setOpen] = useState(false);
  const [draftStep, setDraftStep] = useState("start");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const range = value || defaultDateRange();
  const selectedLabel = presets[range.preset]?.label || "Custom range";
  const canApply = Boolean(range.startDate && range.endDate) && !loading;

  function choosePreset(key) {
    const next = { preset: key, ...presets[key] };
    onChange?.(next);
    if (key !== "custom") onApply?.(next);
  }

  function updateCustom(field, nextValue) {
    onChange?.({ ...range, preset: "custom", label: "Custom range", [field]: nextValue });
  }

  function pickDay(dateValue) {
    if (draftStep === "start" || !range.startDate || (range.startDate && range.endDate)) {
      onChange?.({ ...range, preset: "custom", label: "Custom range", startDate: dateValue, endDate: "" });
      setDraftStep("end");
      return;
    }
    const startTime = new Date(`${range.startDate}T12:00:00`).getTime();
    const nextTime = new Date(`${dateValue}T12:00:00`).getTime();
    onChange?.({
      ...range,
      preset: "custom",
      label: "Custom range",
      startDate: nextTime < startTime ? dateValue : range.startDate,
      endDate: nextTime < startTime ? range.startDate : dateValue,
    });
    setDraftStep("start");
  }

  function apply() {
    if (!canApply) return;
    setOpen(false);
    onApply?.(range);
  }

  return (
    <div className="admin-date-range-filter">
      <button className="date-chip" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span aria-hidden="true">Date</span>
        <strong>{selectedLabel}</strong>
      </button>
      <button className="date-chip date-chip-wide" type="button" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">Range</span>
        <strong>{formatDate(range.startDate)} - {formatDate(range.endDate)}</strong>
      </button>
      {meta ? <span className="date-range-meta">{meta}</span> : null}
      {open ? (
        <div className="date-range-popover">
          <div className="date-range-menu" role="menu" aria-label={label}>
            {[
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["last7", "Last"],
              ["monthToDate", "Period to date"],
              ["yearToDate", "Year to date"],
              ["custom", "Custom range"],
            ].map(([key, text]) => (
              <button className={range.preset === key ? "is-active" : ""} key={key} type="button" onClick={() => key === "custom" ? onChange?.({ ...range, preset: "custom", label: "Custom range" }) : choosePreset(key)}>
                {text}
              </button>
            ))}
          </div>
          <div className="date-range-main">
            <div className="date-range-inputs">
              <input type="date" value={range.startDate || ""} onChange={(event) => updateCustom("startDate", event.target.value)} aria-label={`${label} start`} />
              <span>-</span>
              <input type="date" value={range.endDate || ""} onChange={(event) => updateCustom("endDate", event.target.value)} aria-label={`${label} end`} />
            </div>
            <div className="date-calendar-toolbar">
              <button type="button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <strong>{draftStep === "end" ? "Choose end date" : "Choose start date"}</strong>
              <button type="button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month">›</button>
            </div>
            <div className="date-calendar-shell">
              <CalendarMonth month={calendarMonth} range={range} onPick={pickDay} />
              <CalendarMonth month={new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)} range={range} onPick={pickDay} />
            </div>
            <div className="date-range-preview">
              <span>{selectedLabel}</span>
              <strong>{formatDate(range.startDate)} - {range.endDate ? formatDate(range.endDate) : "Select end date"}</strong>
            </div>
            <div className="date-range-actions">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" onClick={apply} disabled={!canApply}>{loading ? "Applying..." : "Apply"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
