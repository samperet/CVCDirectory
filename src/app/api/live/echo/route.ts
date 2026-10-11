import { randomUUID } from "crypto";
import { experimental_upgradeWebSocket } from "@vercel/functions";
import { getSessionUser } from "@/lib/auth/session";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";
// A connection lasts as long as the function may run; the browser reconnects after that.
export const maxDuration = 300;

/** Which function instance this is, so a test can see when two connections land on different ones. */
const INSTANCE = randomUUID().slice(0, 8);

/**
 * A spike, to be removed again: does a WebSocket open through Vercel's edge,
 * this app's middleware (which lets this path through signed out) and a
 * Next 14 route handler? Signed-in residents get their messages echoed back,
 * with their name and the instance; anyone else is told to sign in and the
 * socket closes. Off Vercel (`next start`) there's no upgrade to be had: 501.
 */
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  try {
    return await experimental_upgradeWebSocket((ws) => {
      const startedAt = Date.now();
      if (!user?.personId) {
        ws.send(JSON.stringify({ error: "Sign in to use live editing", instance: INSTANCE }));
        ws.close(4401, "Sign in");
        return;
      }
      ws.send(JSON.stringify({ hello: user.name, instance: INSTANCE }));
      ws.on("message", (data) => {
        const text = String(data).slice(0, 1000);
        ws.send(
          JSON.stringify({
            from: user.name,
            text,
            instance: INSTANCE,
            openFor: Math.round((Date.now() - startedAt) / 1000),
          })
        );
      });
    });
  } catch (error) {
    console.warn(`[live] no WebSocket upgrade here (${(error as Error).name})`);
    return problem("Live connections only work on Vercel", 501);
  }
}
