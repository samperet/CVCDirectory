"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bot,
  CalendarClock,
  Check,
  Copy,
  Download,
  Fingerprint,
  HardDrive,
  Mail,
  ShieldAlert,
  Stamp,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { TIME_ZONE, timeAgo } from "@/lib/time";
import { formatBytes, type BackupRecord, type SubscriptionView } from "@/lib/backups/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * The backups page (`/backups`, unlisted): what a backup holds and what it
 * leaves out, signing up for them — an email when each is ready, a feed
 * address for an agent or script (shown once), a copy in storage of your
 * own (tested before it's kept) — and the backups kept, each to download
 * with its fingerprint and timestamp proof. Admins also see **Export now**
 * (made, kept, sent to everyone signed up, and downloaded) and whether the
 * weekly one is scheduled.
 */

type BackupsData = {
  backups: BackupRecord[];
  subscription: SubscriptionView;
  isAdmin: boolean;
  signedUp?: number;
  scheduled?: boolean;
};

export const backupsQuery = {
  queryKey: ["backups"],
  queryFn: () => apiFetch<BackupsData>("/api/backups"),
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Copy text, saying so. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0 gap-1.5"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      aria-label={label}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function useSubscriptionChange<T>(fn: (input: T) => Promise<{ subscription: SubscriptionView }>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ subscription }) =>
      queryClient.setQueryData<BackupsData>(["backups"], (old) =>
        old ? { ...old, subscription } : old
      ),
    onError: (error: Error) =>
      toast({ title: "That didn't work", description: error.message, variant: "destructive" }),
  });
}

function EmailSignUp({ on }: { on: boolean }) {
  const change = useSubscriptionChange((email: boolean) =>
    apiFetch<{ subscription: SubscriptionView }>("/api/backups/subscription", {
      method: "PATCH",
      body: JSON.stringify({ email }),
    })
  );
  return (
    <div className="flex flex-wrap items-start justify-between gap-3" data-backup-email>
      <div className="flex min-w-0 flex-1 basis-[16rem] flex-col gap-1">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Mail className="h-4 w-4 text-primary" aria-hidden /> Email
        </h3>
        <p className="text-sm text-foreground-light">
          An email when each one is ready, with a link back here to download it.
        </p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={on}
          disabled={change.isPending}
          onChange={() => change.mutate(!on)}
          aria-label="Email me when a backup is ready"
        />
        <span
          aria-hidden
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            on ? "bg-primary" : "bg-border"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
              on ? "left-6" : "left-1"
            )}
          />
        </span>
        {on ? "On" : "Off"}
      </label>
    </div>
  );
}

function FeedSignUp({ on }: { on: boolean }) {
  const confirm = useConfirm();
  const [url, setUrl] = useState<string | null>(null);
  const make = useSubscriptionChange(async () => {
    const made = await apiFetch<{ url: string; subscription: SubscriptionView }>(
      "/api/backups/subscription/feed",
      { method: "POST" }
    );
    setUrl(made.url);
    return made;
  });
  const stop = useSubscriptionChange(async () => {
    const stopped = await apiFetch<{ subscription: SubscriptionView }>(
      "/api/backups/subscription/feed",
      { method: "DELETE" }
    );
    setUrl(null);
    return stopped;
  });
  const busy = make.isPending || stop.isPending;
  return (
    <div className="flex flex-col gap-3" data-backup-feed>
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Bot className="h-4 w-4 text-primary" aria-hidden /> A feed, for an agent or a script
        </h3>
        <p className="text-sm text-foreground-light">
          A private address that lists the backups as JSON, each with a link to its zip, its
          fingerprint and its proof — no sign-in needed, so anything can fetch them on a schedule.
          Keep it secret: anyone with it can download the backups.
        </p>
      </div>
      {url ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">
            Your feed&apos;s address — copy it now, it isn&apos;t shown again:
          </p>
          <div className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-foreground"
              data-backup-feed-url
            >
              {url}
            </code>
            <CopyButton text={url} label="Copy the feed's address" />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {on ? (
          <>
            {!url ? (
              <Pill tone="pine" className="gap-1">
                <Check className="h-3.5 w-3.5" aria-hidden /> You have a feed
              </Pill>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Make a new feed address?",
                    body: "The one you have now stops working.",
                    confirmLabel: "Make a new one",
                  })
                )
                  make.mutate(undefined);
              }}
            >
              New address
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Stop your feed?",
                    body: "Its address stops working. You can make a new one any time.",
                    confirmLabel: "Stop it",
                    destructive: true,
                  })
                )
                  stop.mutate(undefined);
              }}
            >
              Stop the feed
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => make.mutate(undefined)}>
            {make.isPending ? "Making it…" : "Make a feed address"}
          </Button>
        )}
      </div>
    </div>
  );
}

const EMPTY_STORAGE = {
  endpoint: "",
  region: "auto",
  bucket: "",
  prefix: "cvc-backups/",
  accessKeyId: "",
  secretAccessKey: "",
};

function StorageSignUp({ storage }: { storage: SubscriptionView["storage"] }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY_STORAGE | null>(null);
  const ids = useId();
  const save = useSubscriptionChange(async (input: typeof EMPTY_STORAGE) => {
    const saved = await apiFetch<{ subscription: SubscriptionView }>(
      "/api/backups/subscription/storage",
      { method: "PUT", body: JSON.stringify(input) }
    );
    setForm(null);
    toast({ title: "Connected", description: "Each new backup will be copied there." });
    return saved;
  });
  const remove = useSubscriptionChange(() =>
    apiFetch<{ subscription: SubscriptionView }>("/api/backups/subscription/storage", {
      method: "DELETE",
    })
  );
  const field = (
    key: keyof typeof EMPTY_STORAGE,
    label: string,
    hint: string,
    extra?: React.InputHTMLAttributes<HTMLInputElement>
  ) => (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={`${ids}-${key}`} className="font-medium text-foreground">
        {label}
      </label>
      <Input
        id={`${ids}-${key}`}
        aria-describedby={`${ids}-${key}-hint`}
        value={form?.[key] ?? ""}
        onChange={(event) => setForm((old) => old && { ...old, [key]: event.target.value })}
        autoComplete="off"
        spellCheck={false}
        {...extra}
      />
      <span id={`${ids}-${key}-hint`} className="text-xs text-muted">
        {hint}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3" data-backup-storage>
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <HardDrive className="h-4 w-4 text-primary" aria-hidden /> A copy in your own storage
        </h3>
        <p className="text-sm text-foreground-light">
          Each new backup copied to a bucket you own, on any S3-compatible service — Backblaze B2,
          Amazon S3, Wasabi, Cloudflare R2, or Filebase (which keeps it on IPFS too). Give CVC a key
          that can only write to that bucket.
        </p>
      </div>
      {storage && !form ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
          <p className="break-all text-foreground">
            <span className="font-medium">{storage.bucket}</span>/{storage.prefix} at{" "}
            {storage.endpoint}
          </p>
          <p className="text-xs text-muted">Key {storage.accessKeyId}</p>
          {storage.last ? (
            <p
              className={cn("text-xs", storage.last.ok ? "text-pine" : "text-destructive")}
              data-backup-storage-last
            >
              {storage.last.ok ? "Last copy went there" : "The last copy failed"}{" "}
              {timeAgo(storage.last.at)}
              {storage.last.error ? ` — ${storage.last.error}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted">Connected — the next backup goes there.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setForm({
                  ...EMPTY_STORAGE,
                  endpoint: storage.endpoint,
                  region: storage.region,
                  bucket: storage.bucket,
                  prefix: storage.prefix,
                  accessKeyId: storage.accessKeyId,
                })
              }
            >
              Change
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              disabled={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Stop copying backups to your storage?",
                    body: "What's there already stays. CVC forgets the key.",
                    confirmLabel: "Stop",
                    destructive: true,
                  })
                )
                  remove.mutate(undefined);
              }}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        </div>
      ) : form ? (
        <form
          className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="sm:col-span-2">
            {field(
              "endpoint",
              "Address",
              "The service's S3 address, like https://s3.us-west-002.backblazeb2.com",
              { type: "url", inputMode: "url", required: true, placeholder: "https://" }
            )}
          </div>
          {field("bucket", "Bucket", "Made beforehand, on the service", { required: true })}
          {field("prefix", "Folder", "Where in the bucket they go")}
          {field("region", "Region", "As the service names it; “auto” for R2")}
          {field("accessKeyId", "Access key id", "From the key you made for CVC", {
            required: true,
          })}
          <div className="sm:col-span-2">
            {field(
              "secretAccessKey",
              "Secret access key",
              "Kept sealed; never shown again (give it again to change anything)",
              { type: "password", required: true }
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "Checking it…" : "Check and connect"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setForm(EMPTY_STORAGE)}>
            Connect storage
          </Button>
        </div>
      )}
    </div>
  );
}

function BackupRow({ backup }: { backup: BackupRecord }) {
  const base = `/api/backups/${backup.id}`;
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-backup={backup.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{when(backup.at)}</p>
          <p className="text-xs text-muted">
            {formatBytes(backup.bytes)} · {backup.files.toLocaleString()} files
            {backup.site ? " · with the site's code" : ""} · made by {backup.by}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={base}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft hover:bg-primary/90"
            data-backup-download
          >
            <Download className="h-4 w-4" aria-hidden /> Download
          </a>
          {backup.timestamped ? (
            <a
              href={`${base}?file=ots`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-accent"
              title="Its OpenTimestamps proof"
              data-backup-proof
            >
              <Stamp className="h-4 w-4" aria-hidden /> Proof
            </a>
          ) : null}
        </div>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">Fingerprint (SHA-256):</span>
        <code className="min-w-0 truncate" title={backup.sha256} data-backup-sha>
          {backup.sha256}
        </code>
      </p>
    </li>
  );
}

function ExportNow({ signedUp }: { signedUp: number }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const make = useMutation({
    mutationFn: () => apiFetch<{ backup: BackupRecord }>("/api/backups", { method: "POST" }),
    onSuccess: ({ backup }) => {
      queryClient.setQueryData<BackupsData>(["backups"], (old) =>
        old ? { ...old, backups: [backup, ...old.backups.filter((b) => b.id !== backup.id)] } : old
      );
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({ title: "Backup made", description: `${formatBytes(backup.bytes)} — downloading it` });
      window.location.assign(`/api/backups/${backup.id}`);
    },
    onError: (error: Error) =>
      toast({
        title: "The backup couldn't be made",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <Button
      className="gap-1.5"
      disabled={make.isPending}
      data-backup-export
      onClick={async () => {
        if (
          await confirm({
            title: "Export a backup now?",
            body: `It's kept with the others and downloaded, and sent to ${
              signedUp === 1 ? "the 1 resident" : `the ${signedUp} residents`
            } signed up for them. It can take a few minutes.`,
            confirmLabel: "Export now",
          })
        )
          make.mutate();
      }}
    >
      <Archive className="h-4 w-4" /> {make.isPending ? "Making it…" : "Export now"}
    </Button>
  );
}

export function BackupsClient() {
  const { data, isLoading, error } = useQuery(backupsQuery);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorCard error={error} fallback="The backups couldn't be shown." />;
  const { backups, subscription, isAdmin } = data;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" data-backups>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-[18rem] flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Backups</h1>
          <p className="text-sm text-foreground-light">
            Everything in CVC — the directory, circles, documents and files, tasks, the calendar,
            the forum, the loan library, photos — and the site&apos;s own code, in one zip, made
            every Monday morning. The newest eight are kept here; sign up to keep your own.
          </p>
        </div>
        {isAdmin ? <ExportNow signedUp={data.signedUp ?? 0} /> : null}
      </div>

      {isAdmin ? (
        <p className="-mt-3 flex items-center gap-2 text-xs text-muted" data-backup-admin>
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          {data.scheduled
            ? "The weekly backup is scheduled."
            : "The weekly backup isn't running: set CRON_SECRET in Vercel to start it."}{" "}
          {data.signedUp ?? 0} signed up.
        </p>
      ) : null}

      <Card className="flex gap-3 border-sun/50 bg-sun/10 p-4 text-sm text-foreground">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[#7a5200]" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">A backup holds residents&apos; private details</p>
          <p className="text-foreground-light">
            Names, emails, phone numbers and everything shared in circles — what any resident can
            see in the app. Keep it where only you can read it, and delete old copies you don&apos;t
            need. Left out: private messages, what only admins see (like the sign-in log), finances
            a circle keeps to its members, the app&apos;s own keys, and backup sign-ups.
          </p>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHeading>Get them</SectionHeading>
        <EmailSignUp on={subscription.email} />
        <hr className="border-border" />
        <FeedSignUp on={subscription.feed} />
        <hr className="border-border" />
        <StorageSignUp storage={subscription.storage} />
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeading icon={Archive} count={backups.length}>
          Kept here
        </SectionHeading>
        {backups.length ? (
          <Card className="p-0">
            <ul className="flex flex-col divide-y divide-border">
              {backups.map((backup) => (
                <BackupRow key={backup.id} backup={backup} />
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted">No backups yet — the first is made next Monday.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 text-sm text-foreground-light">
        <SectionHeading icon={Fingerprint}>What&apos;s inside, and checking one</SectionHeading>
        <p>
          Open the zip and start with <code>README.md</code>. <code>data/</code> holds every
          document and file as CVC stores them (JSON, readable by any program or agent),{" "}
          <code>pages/</code> each written page as Markdown, and <code>manifest.json</code> lists
          every file with its size and fingerprint.
        </p>
        <p>
          A backup&apos;s fingerprint is the SHA-256 of its zip (<code>shasum -a 256</code>). Its
          proof is an OpenTimestamps timestamp of that fingerprint, anchored in Bitcoin within a few
          hours: <code>ots verify</code> (from opentimestamps.org) shows it existed, exactly as it
          is, that day.
        </p>
      </section>
    </div>
  );
}
