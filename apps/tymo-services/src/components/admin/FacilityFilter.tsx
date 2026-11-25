import Form from "next/form";
import type { AdminFacilityOption, AdminStatusFilter } from "@tymo/company/admin";
import { buttonClass, inputClass } from "./controls";
import { ChevronDownIcon } from "./icons";

/** GET form: picks a facility and keeps the current status tab. Works without JavaScript. */
export function FacilityFilter({
  options,
  selected,
  status,
}: {
  options: AdminFacilityOption[];
  selected: string | null;
  status: AdminStatusFilter;
}) {
  return (
    <Form action="/admin" className="flex w-full items-end gap-2 md:w-auto">
      {status !== "requested" ? <input type="hidden" name="status" value={status} /> : null}
      <div className="min-w-0 flex-1 md:w-72 md:flex-none">
        <label htmlFor="facility-filter" className="mb-1 block text-[13px] font-medium text-muted">
          Facility
        </label>
        <div className="relative">
          {/* Keyed so back/forward navigation shows the facility in the URL, not a stale pick. */}
          <select
            key={selected ?? ""}
            id="facility-filter"
            name="facility"
            defaultValue={selected ?? ""}
            className={`${inputClass} appearance-none truncate pr-10`}
          >
            <option value="">All facilities</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <button type="submit" className={buttonClass("secondary")}>
        Filter
      </button>
    </Form>
  );
}
