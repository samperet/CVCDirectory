import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Illustrated icons for the sections that have one, by the section's path.
 * A changed icon gets a new file name, so no browser or image cache can keep
 * showing the old one.
 */
const ART: Record<string, string> = {
  "/directory": "/sections/directory-neighbors.webp",
  "/documents": "/sections/documents.webp",
  "/library": "/sections/library.webp",
  "/resources": "/sections/resources-map.webp",
  "/forum": "/sections/forum.webp",
  "/circles": "/sections/circles.webp",
  "/skills": "/sections/skills.webp",
  "/photos": "/sections/photos.webp",
};

export const hasSectionArt = (href: string) => href in ART;

/** A section's illustration, or nothing if it doesn't have one. Decorative: the section's name is always beside it. */
export function SectionArt({ href, size, className }: { href: string; size: number; className?: string }) {
  const src = ART[href];
  if (!src) return null;
  return <Image src={src} alt="" width={size} height={size} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
}
