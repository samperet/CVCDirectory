import { ResourcesClient } from "@/components/resources/resources-client";

export const metadata = { title: "Resources · CVC Directory" };

/** One category's recommendations. */
export default function ResourceCategoryPage({ params }: { params: { category: string } }) {
  return <ResourcesClient category={params.category} />;
}
