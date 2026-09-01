import { computeReviewWindow, summarizeExtension } from "./logic";
import { isDurable } from "./store";
import { ProposalDocument, ProposalListItem, ProposalStateResponse } from "./types";

export function buildStateResponse(doc: ProposalDocument): ProposalStateResponse {
  const { content, state } = doc;
  const extension = summarizeExtension(state.extensionClicks.length, content.maxExtraDays);
  const review = computeReviewWindow(content, extension.extraDays);
  return {
    content,
    state,
    extension,
    review,
    meetingRequested: state.meetingRequests.length >= content.meetingRequestThreshold,
    persistent: isDurable(),
  };
}

export function buildListItem(doc: ProposalDocument): ProposalListItem {
  const { content, state } = doc;
  const extension = summarizeExtension(state.extensionClicks.length, content.maxExtraDays);
  return {
    content,
    review: computeReviewWindow(content, extension.extraDays),
    questionCount: state.questions.length,
    meetingRequested: state.meetingRequests.length >= content.meetingRequestThreshold,
  };
}
