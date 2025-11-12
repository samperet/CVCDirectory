import { NextResponse } from "next/server";

export function problem(detail: string, status = 400, title = "Bad Request") {
  return NextResponse.json(
    {
      type: "about:blank",
      title,
      status,
      detail,
    },
    { status }
  );
}
