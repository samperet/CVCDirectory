import { describe, expect, it } from "vitest";
import { invitationToken, readInvitationToken } from "./token";

const id = "0f8c2a1e-5b7d-4c3a-9e2f-1a2b3c4d5e6f";

describe("welcome link tokens", () => {
  it("name the invitation they were made for", () => {
    expect(readInvitationToken(invitationToken(id))).toBe(id);
  });

  it("can't be made up, changed, or pointed at another invitation", () => {
    const token = invitationToken(id);
    const other = "1f8c2a1e-5b7d-4c3a-9e2f-1a2b3c4d5e6f";
    expect(readInvitationToken(`${other}.${token.split(".")[1]}`)).toBeNull();
    expect(readInvitationToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(readInvitationToken(id)).toBeNull();
    expect(readInvitationToken(`${token}.extra`)).toBeNull();
    expect(readInvitationToken(`not-an-id.${token.split(".")[1]}`)).toBeNull();
  });
});
