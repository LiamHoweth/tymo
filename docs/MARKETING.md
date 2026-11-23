# Tymo website roadmap

## End goal

A business owner can visit Tymo, understand what changes for their customers
and staff, try a sample booking, and request a quote for their own setup.
The Tymo team can follow up with a scope and a clear next step. An approved
pilot moves from a quote to a branded booking page and staff onboarding.
Success is a first real booking that staff can approve and reconcile.

Start with businesses that rent fields and courts. Keep the main site useful
to anyone who sells time or space. Use facility examples to explain how
approval, pricing and availability work in practice.

## Release sequence

| Stage | What the site and team need | How to verify it |
| --- | --- | --- |
| Quote intake | Show **Request a quote** from the main navigation, hero and product journey. Collect the basics, confirm receipt and save the inquiry. Let authorized operators review it. | Submit from desktop and mobile, check the saved record, and cover validation and retry behavior. |
| Qualify and respond | Show who Tymo serves, what's included in setup, and answers about approvals, payments and support. Give the team a shared inbox with an owner and status for each inquiry. | Follow a sample inquiry from receipt to a documented reply and scoped quote. Verify notifications through an approved sender and inbox. |
| Pilot onboarding | Turn an accepted quote into a setup checklist for the facility's branding, resources, hours, rules, staff and payout account. Give the owner a sandbox to try it. | Have a pilot operator configure a facility and complete a test approval, cancellation and refund. |
| Live booking | Let renters use the facility's branded page and authorized staff manage requests and payouts. Give owners a clear support path. | Verify production payments, email, access controls, and the first authorized pilot booking before promising live availability. |

Track accepted inquiries, time to first reply, quotes accepted and first
bookings for pilots. Keep contact details out of product analytics. Publish
pricing, customer stories and payment claims once they are approved and can be
supported. Keep the Advance concept labeled as a proposal and use fictional
data in public booking examples.

## Current scope

`apps/tymo-web` owns the public site and quote intake. The form submits to its
own backend and stores inquiries in private Postgres. The team reviews requests
through the operator command in [the deployment guide](DEPLOY.md). Booking,
staff workflows and payment testing have their existing app entry points.
