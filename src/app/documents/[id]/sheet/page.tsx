import { SheetPage } from "@/components/documents/sheet-page";

export const metadata = { title: "Spreadsheet · Documents · Common Pastures" };

export default function Page({ params }: { params: { id: string } }) {
  return <SheetPage id={params.id} />;
}
