import { SchedulePrintClient } from "@/components/circles/schedule-print";

export const metadata = { title: "Print calendar · Common Pastures" };

/** A circle's duty calendar to print, a month to a page (`?months=2026-11,2026-12`). */
export default function SchedulePrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { months?: string | string[] };
}) {
  const months = Array.isArray(searchParams.months)
    ? searchParams.months.join(",")
    : searchParams.months ?? null;
  return <SchedulePrintClient circleId={params.id} months={months} />;
}
