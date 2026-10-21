"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, PenLine, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { McpKeyView } from "@/lib/mcp/store";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";

/**
 * On the AI assistants page (`ai-page.tsx`): your keys for an AI assistant
 * (Claude, ChatGPT, or any MCP client) to read CVC's pages and documents as
 * you — or, ticking the box, to write as you too — each shown once when
 * made, with the connector's address and how to add it, and taken away here
 * at any time (`lib/mcp`).
 */

type Keys = { keys: McpKeyView[]; url: string };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0 gap-1.5"
      aria-label={label}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function AiKeys() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [write, setWrite] = useState(false);
  const [made, setMade] = useState<{
    secret: string;
    url: string;
    label: string;
    write: boolean;
  } | null>(null);
  const keys = useQuery({ queryKey: ["mcp-keys"], queryFn: () => apiFetch<Keys>("/api/mcp/keys") });
  const make = useMutation({
    mutationFn: () =>
      apiFetch<{ key: McpKeyView; secret: string; url: string }>("/api/mcp/keys", {
        method: "POST",
        body: JSON.stringify({ label, scope: write ? "write" : "read" }),
      }),
    onSuccess: (result) => {
      setMade({
        secret: result.secret,
        url: result.url,
        label: result.key.label,
        write: result.key.scope === "write",
      });
      setLabel("");
      setWrite(false);
      void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] });
    },
    onError: (error: Error) =>
      toast({ title: "Couldn't make a key", description: error.message, variant: "destructive" }),
  });
  const drop = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/mcp/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mcp-keys"] }),
    onError: (error: Error) =>
      toast({ title: "Couldn't take it away", description: error.message, variant: "destructive" }),
  });
  const url = keys.data?.url ?? "";
  const withKey = made ? `${made.url}?key=${made.secret}` : "";

  return (
    <Card id="keys" className="flex scroll-mt-24 flex-col gap-4" data-ai-access>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden /> Your keys
        </h2>
        <p className="text-sm text-foreground-light">
          A key is what you give an assistant so it can read CVC as you — or, if you tick the box,
          read and write as you. Make one for each assistant or device, so you can take one away
          without the others.
        </p>
      </div>

      {made ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
          data-ai-key-made
        >
          <p className="font-medium text-foreground">
            Your key “{made.label}” — copy it now, it isn&apos;t shown again.
          </p>
          {made.write ? (
            <p className="text-foreground-light" data-ai-made-write>
              This key can also <strong className="text-foreground">write</strong>: what the
              assistant starts or changes shows under your name, in each page&apos;s history.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs"
              data-ai-secret
            >
              {made.secret}
            </code>
            <CopyButton text={made.secret} label="Copy the key" />
          </div>
          <div className="flex flex-col gap-2 text-foreground-light">
            <p>
              <strong className="text-foreground">Claude.ai or the Claude app</strong> — Settings →
              Connectors → Add custom connector, and paste this address (the key is in it):
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs">
                {withKey}
              </code>
              <CopyButton text={withKey} label="Copy the address with the key" />
            </div>
            <p>
              <strong className="text-foreground">Claude Code</strong> — in a terminal:
            </p>
            <code className="break-all rounded bg-white px-2 py-1.5 text-xs">
              claude mcp add --transport http cvc {made.url} --header &quot;Authorization: Bearer{" "}
              {made.secret}&quot;
            </code>
            <p>
              <strong className="text-foreground">Anything else</strong> — the server is{" "}
              <code>{made.url}</code> (MCP over HTTP); send the key as{" "}
              <code>Authorization: Bearer …</code>, or add <code>?key=…</code> to the address.
            </p>
          </div>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setMade(null)}>
            Done, I&apos;ve saved it
          </Button>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          make.mutate();
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 basis-[14rem] flex-col gap-1 text-sm font-medium text-foreground">
            What&apos;s it for?
            <Input
              value={label}
              maxLength={60}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Claude on my laptop"
              className="bg-white"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            className="gap-1.5"
            disabled={make.isPending}
            data-ai-make
          >
            <KeyRound className="h-4 w-4" /> {make.isPending ? "Making it…" : "Make a key"}
          </Button>
        </div>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={write}
            onChange={(event) => setWrite(event.target.checked)}
            data-ai-write
          />
          <span>
            Let it also <strong>write</strong> as me — start and change pages, add and change
            documents, within what I can do. Every change shows under my name.
          </span>
        </label>
      </form>

      {keys.data?.keys.length ? (
        <ul
          className="flex flex-col divide-y divide-border rounded-lg border border-border"
          data-ai-keys
        >
          {keys.data.keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <KeyRound className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 basis-[10rem] truncate text-foreground">
                {key.label}
              </span>
              {key.scope === "write" ? (
                <Pill tone="amber" size="xs" className="gap-1">
                  <PenLine className="h-3 w-3" aria-hidden /> Can write
                </Pill>
              ) : null}
              <span className="text-xs text-muted">
                {key.lastUsedAt ? `Used ${timeAgo(key.lastUsedAt)}` : "Not used yet"} · made{" "}
                {timeAgo(key.createdAt)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted hover:text-destructive"
                aria-label={`Take away ${key.label}`}
                disabled={drop.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Take away “${key.label}”?`,
                      body: "The assistant holding it can't use CVC any more.",
                      confirmLabel: "Take it away",
                      destructive: true,
                    })
                  )
                    drop.mutate(key.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : keys.data ? (
        <p className="text-sm text-muted">No keys yet.</p>
      ) : null}
      {url ? (
        <p className="text-xs text-muted">
          The connector&apos;s address is <code>{url}</code>. Keys hold your name: treat them like a
          password, and don&apos;t paste them in a shared chat.
        </p>
      ) : null}
    </Card>
  );
}
