import { describe, expect, it, vi } from "vitest";
import { formatFrom, sendViaResend, type OutgoingEmail } from "./deliver";

const email: OutgoingEmail = {
  fromName: "Redbud Soccer Complex",
  fromAddress: "bookings@booktymo.test",
  to: "jamie@example.com",
  replyTo: "frontdesk@redbud.example",
  subject: "Request sent: Indoor Field, Sat Dec 5",
  html: "<p>hi</p>",
  text: "hi",
  idempotencyKey: "outbox-123",
};

describe("sendViaResend", () => {
  it("posts the facility-named sender, reply-to and both bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "re_msg_1" }), { status: 200 }));
    const result = await sendViaResend("re_test_key", email, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ id: "re_msg_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key", "Idempotency-Key": "outbox-123" });
    expect(JSON.parse(init.body)).toEqual({
      from: '"Redbud Soccer Complex" <bookings@booktymo.test>',
      to: ["jamie@example.com"],
      subject: "Request sent: Indoor Field, Sat Dec 5",
      html: "<p>hi</p>",
      text: "hi",
      reply_to: "frontdesk@redbud.example",
    });
  });

  it("throws with Resend's message on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }), { status: 422 }));
    await expect(sendViaResend("k", email, fetchMock as unknown as typeof fetch)).rejects.toThrow("Resend 422: Invalid `to` field.");
  });

  it("keeps the From header safe", () => {
    expect(formatFrom('Bad "Name" <x@y>\r\nBcc: z', "a@b.test")).toBe('"Bad Name x@yBcc: z" <a@b.test>');
    expect(formatFrom("", "a@b.test")).toBe('"Tymo" <a@b.test>');
  });
});
