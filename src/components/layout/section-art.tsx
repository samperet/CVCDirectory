import Image from "next/image";
import { cn } from "@/lib/utils";

/** Illustrated icons for the sections that have one, by the section's path. */
const ART: Record<string, string> = {
  "/directory": "/sections/directory.webp",
  "/documents": "/sections/documents.webp",
  "/library": "/sections/library.webp",
  "/resources": "/sections/resources.webp",
  "/forum": "/sections/forum.webp",
};

export const hasSectionArt = (href: string) => href in ART;

/** A section's illustration, or nothing if it doesn't have one. Decorative: the section's name is always beside it. */
export function SectionArt({ href, size, className }: { href: string; size: number; className?: string }) {
  const src = ART[href];
  if (!src) return null;
  return <Image src={src} alt="" width={size} height={size} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
}
