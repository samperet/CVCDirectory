"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Champlain Valley Cohousing mark. Clicking it spins the wreath, an
 * easter egg carried over from the CVC Folks directory.
 */
export function CvcLogo({ size = 120, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [spinning, setSpinning] = useState(false);

  const spin = () => {
    const node = ref.current;
    if (spinning || !node) return;
    node.classList.remove("logo-animate");
    // Force a reflow so the animation restarts on every click.
    void node.offsetWidth;
    node.classList.add("logo-animate");
    setSpinning(true);
    setTimeout(() => {
      node.classList.remove("logo-animate");
      setSpinning(false);
    }, 2200);
  };

  return (
    <Image
      ref={ref}
      src="/CVC.png"
      alt="Champlain Valley Cohousing"
      width={size}
      height={size}
      priority
      onClick={spin}
      className={cn("cursor-pointer select-none drop-shadow-lg", className)}
    />
  );
}
