"use client";

import { Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, MessageCircle, Plus, Search } from "lucide-react";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { ErrorCard, Loading } from "@/components/ui/status";
import { KEY, ListResponse } from "@/components/resources/resources-data";

/** Phone numbers, email addresses, and web addresses in a recommendation become links. */
const LINKABLE =
  /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s·,]+|\b[a-z0-9-]+\.(?:com|org|net|us|io|co|biz|info)\b(?:\/[^\s·,]*)?)|(\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b)/gi;

export function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINKABLE)) {
    const [value, email, url, phone] = match;
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const href = email
      ? `mailto:${email}`
      : url
        ? url.startsWith("http")
          ? url
          : `https://${url}`
        : `tel:${phone.replace(/\D/g, "")}`;
    parts.push(
      <a
        key={start}
        href={href}
        {...(url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-secondary-foreground underline decoration-border underline-offset-2 hover:decoration-current"
      >
        {value}
      </a>
    );
    last = start + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </>
  );
}
