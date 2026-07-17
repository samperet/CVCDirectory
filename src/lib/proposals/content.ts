import { ProposalContent } from "./types";

const fourWheelerProposal: ProposalContent = {
  slug: "four-wheeler",
  title: "Four-Wheeler Storage & Agricultural Use Proposal",
  proposer: "Sam",
  circle: "Land Care Circle",
  summary:
    "Sam is requesting permission to keep a good-sized four-wheeler on community land, stored under a cover, used solely for agricultural work, with Sam as the sole responsible steward under the guidance of the Land Care Circle.",
  reviewStartedAt: "2026-07-17T16:00:00.000Z",
  baseReviewDays: 7,
  maxExtraDays: 14,
  meetingRequestThreshold: 3,
  sections: [
    {
      id: "introduction",
      title: "Introduction — The Story",
      icon: "book",
      paragraphs: [
        "I have a good-sized four-wheeler — a working utility machine, not a recreational toy. It was previously stored at our landlord's property, and unexpectedly we needed to move it. That is why this proposal comes to the community on short notice rather than through a longer runway.",
        "Rather than scramble for an off-site solution, I would like to bring it home to community land where it can genuinely serve our shared agricultural work — with clear agreements in place from day one. Much appreciation for your consideration.",
      ],
    },
    {
      id: "request",
      title: "Request",
      icon: "warehouse",
      paragraphs: [
        "I am requesting permission to store the four-wheeler on community land, kept under a cover at all times when not in use — protected from the elements and visually tidy on the land.",
        "The exact parking spot will be chosen with the Land Care Circle so it stays out of the way of gathering spaces, sight lines, and footpaths.",
      ],
    },
    {
      id: "rationale",
      title: "Rationale — Agricultural Use Only",
      icon: "sprout",
      paragraphs: [
        "The four-wheeler will be used solely for agricultural purposes on community land. Several land care projects become easier with a capable utility vehicle on hand:",
      ],
      bullets: [
        "Hauling compost, mulch, soil amendments, and harvest loads",
        "Moving firewood, fencing, tools, and irrigation supplies",
        "Supporting land care workdays and seasonal field work",
        "No recreational riding, no joyriding, no use off the agreed work areas",
      ],
    },
    {
      id: "liability",
      title: "Liability, Training & Key Access",
      icon: "shield",
      paragraphs: [
        "I take the liability concern seriously, and access is designed to be narrow by default.",
      ],
      bullets: [
        "I hold the key. Nobody operates the machine without going through me.",
        "Any member who wants to use it for agricultural work must first complete hands-on training with me covering safe operation, terrain limits, and shutdown.",
        "Only trained members may operate it, and only for the agricultural uses described above.",
        "Keeping it covered and key-controlled minimizes both risk and attractive-nuisance concerns.",
      ],
    },
    {
      id: "logistics",
      title: "Logistics & Stewardship",
      icon: "user",
      paragraphs: [
        "No cost accrues to the community. I will be solely responsible for the four-wheeler — its maintenance, fuel, repairs, and any issues that arise from its presence on the land.",
        "My stewardship operates under the guidance of the Land Care Circle: the circle can set conditions on where and how it is used, and can bring concerns back to me at any time. Following the precedent of the Kubota tractor agreement, this arrangement will be reviewed on an annual basis by the Land Care Circle. If the agreements in this proposal are not working for the community, I will remove it from community land.",
      ],
    },
    {
      id: "process",
      title: "Proposal-Forming Process",
      icon: "list",
      paragraphs: [
        "This proposal follows our sociocratic proposal-forming steps. The issue has been presented (steps 1–2: an unexpected storage need, plus an opportunity for our agricultural work), and this document is the shaped proposal circulated to the circle (step 5c). Your part now:",
      ],
      bullets: [
        "Identify aspects — if a dimension of the issue is missing (noise, insurance, siting, fuel storage…), name it as a question on the relevant section. No solutions needed at that stage; naming the aspect is enough.",
        "Consent rounds — a consent round asks: does the proposal address all identified aspects of the issue? An objection isn't a veto; it points at the aspect not yet addressed, and a piece is added to the proposal to integrate it.",
        "Consent means no paramount objections — not necessarily enthusiasm.",
        "Process adapted from Diana Leafe Christian's Proposal-Forming handout (DianaLeafeChristian.org · EcovillageNews.org).",
      ],
    },
    {
      id: "decision",
      title: "How This Online Review Works",
      icon: "scale",
      paragraphs: [
        "This proposal is open for a 7-day review period, during which anyone can ask questions on any section above — I will respond here so the whole community sees the same answers. Questions are how we surface aspects of the issue and work objections toward integration.",
        "If you feel the conversation needs more time, use “Add a day” to extend the review period. The first extra day takes one click; each further day takes double the clicks of the last, so the window can breathe but not stall forever.",
        "If you feel this needs face-to-face discussion, request to move it to our next community gathering. If enough members agree, the proposal goes to the agenda for in-person consent rounds instead of closing online.",
      ],
    },
  ],
};

const proposals: Record<string, ProposalContent> = {
  [fourWheelerProposal.slug]: fourWheelerProposal,
};

export function getProposal(slug: string): ProposalContent | undefined {
  return proposals[slug];
}

export function listProposals(): ProposalContent[] {
  return Object.values(proposals);
}
