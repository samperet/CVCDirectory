/**
 * Templates for new pages (safe for the browser): a few built in — a
 * meeting's agenda, its notes, a policy, a how-to — and any page its circle
 * marks **Use as a template** (`page.template`). Starting a page from one
 * copies its text with `{{date}}` and `{{circle}}` filled in (the day it's
 * started, and the new page's circle), leaving out its polls and proposals
 * (those belong to the page they were made in).
 */

export interface BuiltInTemplate {
  key: string;
  name: string;
  /** What it's for, in the picker. */
  hint: string;
  body: string;
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "meeting-agenda",
    name: "Meeting agenda",
    hint: "What a meeting will cover, and who's doing what",
    body: `**{{circle}} meeting, {{date}}**

* **Facilitator:** someone
* **Note-taker:** someone

## Check-in

## Items

1. First item
2. Second item

## Proposals to decide

## Next meeting
`,
  },
  {
    key: "meeting-notes",
    name: "Meeting notes",
    hint: "What was said and decided, and what happens next",
    body: `## Check-in

## Discussion

## Decisions

## Actions

* [ ] Who does what, by when
`,
  },
  {
    key: "policy",
    name: "Policy",
    hint: "A rule the circle has agreed, and why",
    body: `## Purpose

What this policy is for, in a sentence or two.

## The policy

1. First point
2. Second point

## Who it applies to

## Review

Written by {{circle}} on {{date}}. To be looked at again in a year.
`,
  },
  {
    key: "how-to",
    name: "How-to",
    hint: "Steps for getting something done",
    body: `:::callout
What this explains, and who it's for.
:::

## You'll need

* Something

## Steps

1. First step
2. Second step

## If something goes wrong
`,
  },
];

export const builtInTemplate = (key: string) =>
  BUILT_IN_TEMPLATES.find((template) => template.key === key);

/** A page's polls and proposals (each on a line of its own) left out of the copy. */
const LIVE_BLOCK = /^[ \t]*::(poll|proposal)\{[^}\n]*\}[ \t]*$\n?/gim;

/** A template's text for a new page: polls and proposals left out, the day and circle filled in. */
export function fillTemplate(body: string, values: { date: string; circle: string }) {
  return body
    .replace(LIVE_BLOCK, "")
    .replace(/\{\{\s*date\s*\}\}/gi, values.date)
    .replace(/\{\{\s*circle\s*\}\}/gi, values.circle)
    .replace(/\n{3,}/g, "\n\n");
}
