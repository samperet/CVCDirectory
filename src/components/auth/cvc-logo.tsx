"use client";

import Image from "next/image";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Champlain Valley Cohousing mark. Clicking it spins the wreath, an
 * easter egg carried over from the CVC Folks directory. The sign-in page also
 * drives it directly (through the forwarded image element) while signing in;
 * `busy` turns the click easter egg off meanwhile.
 */
export const CvcLogo = forwardRef<HTMLImageElement, { size?: number; className?: string; busy?: boolean }>(
  function CvcLogo({ size = 120, className, busy = false }, forwarded) {
    const ref = useRef<HTMLImageElement>(null);
    useImperativeHandle(forwarded, () => ref.current as HTMLImageElement);
    const [spinning, setSpinning] = useState(false);

    const spin = () => {
      const node = ref.current;
      if (busy || spinning || !node) return;
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
        className={cn("select-none drop-shadow-lg will-change-transform", !busy && "cursor-pointer", className)}
      />
    );
  }
);
