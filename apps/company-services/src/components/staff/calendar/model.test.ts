import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { CalendarDay, CalendarItem } from "@tymo/shared/types";
import { buildDay } from "./model";
import { expiresInLabel, joinTimes, resourceName } from "../format";

const zone = "America/Chicago";
const date = "2030-03-04"; // a Monday well in the future: no "now" trimming

function at(hhmm: string, d = date) {
  return DateTime.fromISO(`${d}T${hhmm}`, { zone }).toUTC().toISO()!;
}

function item(kind: CalendarItem["kind"], units: string[], s: string, e: string, label: string, extra: Partial<CalendarItem> = {}): CalendarItem {
  const fmt = (h: string) => DateTime.fromISO(`${date}T${h}`, { zone }).toFormat("h:mm a");
  return { id: `${kind}-${s}`, kind, resourceId: "n1", unitCodes: units, startsAt: at(s), endsAt: at(e), startLocal: fmt(s), endLocal: fmt(e), label, ...extra };
}

function n1Day(items: CalendarItem[], d = date): CalendarDay {
  return {
    date: d,
    dateLabel: "Mon, Mar 4",
    dayStartLocal: "07:00",
    dayEndLocal: "21:00",
    timeZoneLabel: "CT",
    rows: [
      {
        resourceId: "n1",
        code: "N1",
        name: "N1",
        unitCodes: ["N1-a", "N1-b"],
        lanes: [
          { resourceId: "n1a", code: "N1A", label: "Half A", unitCodes: ["N1-a"] },
          { resourceId: "n1b", code: "N1B", label: "Half B", unitCodes: ["N1-b"] },
        ],
        items,
      },
    ],
  };
}

describe("buildDay", () => {
  it("places items in local minutes and finds open time per field and half", () => {
    const day = buildDay(
      n1Day([
        item("booking", ["N1-a"], "10:00", "11:30", "Jordan Reyes", { bookingId: "b1" }),
        item("block", ["N1-a", "N1-b"], "15:00", "17:30", "Practice", { blockId: "k1", occurrenceDate: date }),
      ]),
      zone,
    );
    const row = day.rows[0];
    const [half, block] = row.items;

    expect(half).toMatchObject({ startMin: 600, endMin: 690, full: false, laneIds: ["n1a"], scopeCode: "N1A", timeLabel: "10:00 to 11:30 AM" });
    expect(block).toMatchObject({ startMin: 900, endMin: 1050, full: true, scopeCode: "N1", timeLabel: "3:00 to 5:30 PM" });

    const open = row.agenda.flatMap((e) => (e.type === "open" ? [`${e.slot.code} ${e.slot.timeLabel}`] : []));
    expect(open).toEqual(["N1 7:00 to 10:00 AM", "N1B 10:00 to 11:30 AM", "N1 11:30 AM to 3:00 PM", "N1 5:30 to 9:00 PM"]);
    expect(row.agenda.map((e) => e.type)).toEqual(["open", "item", "open", "open", "item", "open"]);
  });

  it("labels a full-day closure and clamps it to the window", () => {
    const closure: CalendarItem = {
      ...item("closure", ["N1-a", "N1-b"], "00:00", "00:00", "Thanksgiving", { blockId: "k2" }),
      endsAt: at("00:00", "2030-03-05"),
      startLocal: "12:00 AM",
      endLocal: "12:00 AM",
    };
    const day = buildDay(n1Day([closure]), zone);
    expect(day.rows[0].items[0]).toMatchObject({ timeLabel: "All day", startMin: 420, endMin: 1260, visible: true });
    expect(day.rows[0].agenda.filter((e) => e.type === "open")).toHaveLength(0);
  });

  it("offers no open time on past days", () => {
    const day = buildDay(n1Day([], "2020-01-06"), zone);
    expect(day.isPast).toBe(true);
    expect(day.rows[0].agenda).toHaveLength(0);
  });
});

describe("format helpers", () => {
  it("writes countdowns the way the queue shows them", () => {
    expect(expiresInLabel((46 * 60 + 5) * 60000)).toBe("1 day 22 hr");
    expect(expiresInLabel(100 * 60000)).toBe("1 hr 40 min");
    expect(expiresInLabel(12 * 60000 + 500)).toBe("12 min");
  });

  it("joins times with one meridiem when they share it", () => {
    expect(joinTimes("3:00 PM", "5:30 PM")).toBe("3:00 to 5:30 PM");
    expect(joinTimes("11:00 AM", "1:00 PM")).toBe("11:00 AM to 1:00 PM");
  });

  it("names halves without repeating the parent", () => {
    expect(resourceName("N1A", "N1 · Half A")).toBe("N1A · Half A");
    expect(resourceName("N1", "N1 · Full field")).toBe("N1 · Full field");
    expect(resourceName("C1", "Court 1")).toBe("C1 · Court 1");
  });
});
