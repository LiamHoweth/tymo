import { describe, expect, it } from "vitest";
import { durationOptions, groupAnchor } from "./anchors";
import { holdRanOutCopy, startCheckoutErrorCopy, submitErrorCopy } from "./copy";
import { compactRange, dayAndTime, longDay, noticeWords, spanWords, wordsRange } from "./time";
import { fakeCardLabel, groupCard, validateDetails } from "./validate";

const facility = {
  name: "Redbud Soccer Complex",
  contactPhone: "5805550142",
  leadTimeMinutes: 1440,
  bookingWindowDays: 60,
  timeZone: "America/Chicago",
  cancelCutoffMinutes: 2880,
};

describe("time labels (facility zone, never the phone's)", () => {
  it("compacts a range that shares AM/PM", () => {
    expect(compactRange("5:00 PM", "6:30 PM")).toBe("5:00–6:30 PM");
    expect(compactRange("11:30 AM", "1:00 PM")).toBe("11:30 AM–1:00 PM");
  });

  it("writes review-line ranges and days in Central Time", () => {
    // 23:00 UTC on Dec 5 2026 is 5:00 PM CST.
    expect(wordsRange("2026-12-05T23:00:00Z", "2026-12-06T00:30:00Z", "America/Chicago")).toBe("5:00 to 6:30 PM");
    expect(longDay("2026-12-05T23:00:00Z", "America/Chicago")).toBe("Saturday, December 5");
    expect(dayAndTime("2026-12-03T23:00:00Z", "America/Chicago")).toBe("Thu, Dec 3 at 5:00 PM");
  });

  it("words notice and cutoffs", () => {
    expect(noticeWords(1440)).toBe("24 hours'");
    expect(spanWords(2880)).toBe("48 hours");
    expect(spanWords(60)).toBe("1 hour");
  });
});

describe("customer copy", () => {
  it("says a slot was just taken at Continue", () => {
    expect(startCheckoutErrorCopy("slot_taken", facility, "5:00–6:30 PM")).toBe(
      "5:00–6:30 PM was just taken. Pick another time.",
    );
  });

  it("says when requests need notice, with the desk phone", () => {
    expect(startCheckoutErrorCopy("too_soon", facility, "")).toBe(
      "Requests need 24 hours' notice. For sooner, call (580) 555-0142.",
    );
  });

  it("explains a hold that ran out and that nothing was charged", () => {
    expect(holdRanOutCopy("5:00–6:30 PM")).toBe(
      "Your hold on 5:00–6:30 PM ran out and the time is no longer available. You haven't been charged. Pick another time; we kept your details.",
    );
    expect(submitErrorCopy("card_declined", "")).toBe(
      "Your card was declined. Try another card, or call the number on the back of yours.",
    );
  });
});

describe("details validation", () => {
  it("asks for each missing field in words", () => {
    expect(validateDetails({ name: " ", phone: "555-01", email: "jamie@", team: "", waiverAccepted: false })).toEqual({
      name: "Enter your name.",
      phone: "Enter a 10-digit phone number.",
      email: "Enter an email address, like name@example.com.",
      waiverAccepted: "Check the box to agree to the waiver.",
    });
  });

  it("accepts a US number with a leading 1 and formatting", () => {
    expect(
      validateDetails({ name: "Jamie", phone: "+1 (580) 555-0199", email: "jamie@example.com", team: "", waiverAccepted: true }),
    ).toEqual({});
  });
});

describe("helpers", () => {
  it("runs durations from min to max in 30-minute steps", () => {
    expect(durationOptions(60, 180)).toEqual([60, 90, 120, 150, 180]);
  });

  it("labels test cards and groups digits", () => {
    expect(fakeCardLabel("4242424242424242")).toBe("Visa ending 4242");
    expect(groupCard("4000000000000002")).toBe("4000 0000 0000 0002");
  });

  it("anchors group labels", () => {
    expect(groupAnchor("Grass fields")).toBe("grass-fields");
  });
});
