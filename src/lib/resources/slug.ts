/** A resource category's address: "Attorney, real estate" → "attorney-real-estate". */
export function categorySlug(category: string) {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
