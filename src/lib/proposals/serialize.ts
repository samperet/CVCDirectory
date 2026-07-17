import { computeReviewWindow, summarizeExtension } from "./logic";
import { isPersistent } from "./store";
import { ProposalContent, ProposalState, ProposalStateResponse } from "./types";

export function buildStateResponse(
  content: ProposalContent,
  state: ProposalState
): ProposalStateResponse {
  const extension = summarizeExtension(state.extensionClicks.length, content.maxExtraDays);
  const review = computeReviewWindow(content, extension.extraDays);
  return {
    state,
    extension,
    review,
    meetingRequested: state.meetingRequests.length >= content.meetingRequestThreshold,
    persistent: isPersistent(),
  };
}
