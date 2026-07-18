export interface ProposalSection {
  id: string;
  title: string;
  icon: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface ProposalContent {
  slug: string;
  title: string;
  proposer: string;
  circle: string;
  summary: string;
  reviewStartedAt: string;
  baseReviewDays: number;
  maxExtraDays: number;
  meetingRequestThreshold: number;
  sections: ProposalSection[];
}

export interface QuestionResponse {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ProposalQuestion {
  id: string;
  sectionId: string;
  authorName: string;
  body: string;
  createdAt: string;
  responses: QuestionResponse[];
}

export interface ExtensionClick {
  id: string;
  name: string | null;
  createdAt: string;
}

export interface MeetingRequest {
  id: string;
  name: string | null;
  note: string | null;
  createdAt: string;
}

export interface ProposalState {
  questions: ProposalQuestion[];
  extensionClicks: ExtensionClick[];
  meetingRequests: MeetingRequest[];
  updatedAt: string | null;
}

export interface ExtensionSummary {
  totalClicks: number;
  extraDays: number;
  clicksTowardNextDay: number;
  clicksNeededForNextDay: number;
  atMaxExtension: boolean;
}

export interface ReviewWindow {
  startsAt: string;
  endsAt: string;
  totalDays: number;
  closed: boolean;
}

export interface ProposalDocument {
  content: ProposalContent;
  state: ProposalState;
}

export interface ProposalStateResponse {
  content: ProposalContent;
  state: ProposalState;
  extension: ExtensionSummary;
  review: ReviewWindow;
  meetingRequested: boolean;
  persistent: boolean;
}

export interface ProposalListItem {
  content: ProposalContent;
  review: ReviewWindow;
  questionCount: number;
  meetingRequested: boolean;
}
