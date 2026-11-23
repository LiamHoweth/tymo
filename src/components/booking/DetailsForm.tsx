"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, CheckboxField, Notice, Sheet, TextField, buttonClass } from "@/components/ui";
import { formatPhone } from "@/lib/format";
import type { DetailsState } from "./action-types";
import { holdRanOutCopy } from "./copy";
import { HoldTimer } from "./HoldTimer";
import { ArrowRight } from "./icons";
import { StepFrame } from "./StepChrome";
import { SummaryBar, barButtonClass } from "./SummaryBar";
import { validateDetails, type DetailsErrors, type DetailsValues } from "./validate";

const FIELD_IDS: Record<keyof DetailsValues, string> = {
  name: "details-name",
  phone: "details-phone",
  email: "details-email",
  team: "details-team",
  waiverAccepted: "details-waiver",
};
const ORDER: (keyof DetailsValues)[] = ["name", "phone", "email", "team", "waiverAccepted"];

function focusFirst(errors: DetailsErrors) {
  const key = ORDER.find((k) => errors[k]);
  if (key) document.getElementById(FIELD_IDS[key])?.focus();
}

export interface CheckoutSummary {
  title: string;
  when: string;
  price: string;
  expiresAt: string;
}

/** Step 3 of 5: name, mobile, email, optional team, and the waiver box. */
export function DetailsForm({
  action,
  leaveAction,
  initial,
  facilityName,
  waiverText,
  waiverVersion,
  summary,
  range,
}: {
  action: (prev: DetailsState, data: FormData) => Promise<DetailsState>;
  leaveAction: () => Promise<void>;
  initial: DetailsValues;
  facilityName: string;
  waiverText: string;
  waiverVersion: number;
  summary: CheckoutSummary;
  range: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    fieldErrors: {},
    error: null,
    holdExpired: false,
    attempt: 0,
  });
  const [values, setValues] = useState<DetailsValues>(initial);
  const [clientErrors, setClientErrors] = useState<DetailsErrors>({});
  const [edited, setEdited] = useState<{ attempt: number; keys: string[] }>({ attempt: 0, keys: [] });
  const [waiverOpen, setWaiverOpen] = useState(false);
  const holdRef = useRef<HTMLDivElement>(null);

  const serverErrors: DetailsErrors = Object.fromEntries(
    Object.entries(state.fieldErrors).filter(([k]) => !(edited.attempt === state.attempt && edited.keys.includes(k))),
  );
  const errors: DetailsErrors = { ...serverErrors, ...clientErrors };

  useEffect(() => {
    if (state.attempt === 0) return;
    if (state.holdExpired) holdRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    else focusFirst(state.fieldErrors);
  }, [state]);

  const set = <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setClientErrors((e) => ({ ...e, [key]: undefined }));
    setEdited((prev) => ({
      attempt: state.attempt,
      keys: prev.attempt === state.attempt ? [...prev.keys, key] : [key],
    }));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (submitter?.dataset.leave) return; // "Pick another time" skips validation
    if (pending) {
      e.preventDefault();
      return;
    }
    const found = validateDetails(values);
    if (Object.keys(found).length) {
      e.preventDefault();
      setClientErrors(found);
      focusFirst(found);
      return;
    }
    setClientErrors({});
  };

  const leaveButton = (
    <button
      type="submit"
      formAction={leaveAction}
      data-leave="1"
      className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}
    >
      Pick another time
    </button>
  );

  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate>
        <StepFrame
          aside={
            <SummaryBar
              title={summary.title}
              when={summary.when}
              price={summary.price}
              priceNote="Charged only when the front desk confirms."
              footer={<HoldTimer expiresAt={summary.expiresAt} />}
              action={
                state.holdExpired ? (
                  leaveButton
                ) : (
                  <button
                    type="submit"
                    aria-disabled={pending || undefined}
                    className={buttonClass({ variant: "accent", size: "md" }, barButtonClass)}
                  >
                    {pending ? "Saving..." : "Continue"}
                    {pending ? null : <ArrowRight className="h-[18px] w-[18px]" />}
                  </button>
                )
              }
            />
          }
        >
          <div className="max-w-xl space-y-5">
            {state.holdExpired ? (
              <div ref={holdRef}>
                <Notice tone="danger" live="assertive" title="Your hold ran out" actions={leaveButton}>
                  {holdRanOutCopy(range)}
                </Notice>
              </div>
            ) : null}
            {state.error ? (
              <Notice tone="danger" live="assertive">
                {state.error}
              </Notice>
            ) : null}

            <TextField
              id={FIELD_IDS.name}
              name="name"
              label="Your name"
              autoComplete="name"
              value={values.name}
              onChange={(e) => set("name", e.currentTarget.value)}
              error={errors.name}
              required
            />
            <TextField
              id={FIELD_IDS.phone}
              name="phone"
              label="Mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              hint="The front desk calls this number if anything changes."
              value={values.phone}
              onChange={(e) => set("phone", e.currentTarget.value)}
              onBlur={(e) => {
                const phone = formatPhone(e.currentTarget.value);
                setValues((v) => ({ ...v, phone }));
              }}
              error={errors.phone}
              required
            />
            <TextField
              id={FIELD_IDS.email}
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              hint="Your request, receipt and cancel link go here."
              value={values.email}
              onChange={(e) => set("email", e.currentTarget.value)}
              error={errors.email}
              required
            />
            <TextField
              id={FIELD_IDS.team}
              name="team"
              label="Team or group"
              optional
              autoComplete="organization"
              hint="For example, Storm U12."
              value={values.team}
              onChange={(e) => set("team", e.currentTarget.value)}
              error={errors.team}
            />

            <div className="rounded-2xl border border-line bg-white p-4">
              <CheckboxField
                id={FIELD_IDS.waiverAccepted}
                name="waiverAccepted"
                checked={values.waiverAccepted}
                onChange={(e) => set("waiverAccepted", e.currentTarget.checked)}
                label={`I agree to the ${facilityName} rental waiver.`}
                error={errors.waiverAccepted}
              />
              <button
                id="waiver-read"
                type="button"
                onClick={() => setWaiverOpen(true)}
                className="ml-9 mt-1 inline-flex min-h-11 items-center text-[14px] font-semibold text-brand underline underline-offset-4"
              >
                Read the waiver
              </button>
            </div>
          </div>
        </StepFrame>
      </form>

      <Sheet open={waiverOpen} onClose={() => setWaiverOpen(false)} title={`${facilityName} rental waiver`}>
        <div className="whitespace-pre-line text-[15px] leading-relaxed text-text">
          {waiverText.trim() || "The front desk hasn't added waiver text yet. Ask them for a copy before you agree."}
        </div>
        <p className="mt-4 text-[13px] text-muted">Waiver version {waiverVersion}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            block
            onClick={() => {
              set("waiverAccepted", true);
              setWaiverOpen(false);
            }}
          >
            I agree
          </Button>
          <Button block variant="ghost" onClick={() => setWaiverOpen(false)}>
            Close
          </Button>
        </div>
      </Sheet>
    </>
  );
}
