import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

// POST /api/public/github/webhook
// Configure in the connected repo's Settings → Webhooks:
//   Payload URL: https://<your-app>.lovable.app/api/public/github/webhook
//   Content type: application/json
//   Secret: value of GITHUB_WEBHOOK_SECRET
//   Events: "Just the push event"
//
// On a matching push to the mirrored branch we re-run the mirror integrity
// check and log a system_event so the dashboard + /api/public/bot/status
// reflect the new HEAD immediately.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Hub-Signature-256, X-GitHub-Event, X-GitHub-Delivery",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function verifySignature(secret: string, raw: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/github/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret) return json({ error: "server missing GITHUB_WEBHOOK_SECRET" }, 500);

        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        if (!verifySignature(secret, raw, sig)) return json({ error: "bad signature" }, 401);

        const event = request.headers.get("x-github-event") ?? "";
        const delivery = request.headers.get("x-github-delivery") ?? "";
        if (event === "ping") return json({ ok: true, pong: true });
        if (event !== "push") return json({ ok: true, ignored: event });

        let payload: { ref?: string; after?: string; repository?: { full_name?: string } } = {};
        try { payload = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

        const { MIRROR_REPO, MIRROR_BRANCH, compareWithGitHub } =
          await import("@/lib/github-mirror.server");

        const refOk = payload.ref === `refs/heads/${MIRROR_BRANCH}`;
        const repoOk = !payload.repository?.full_name || payload.repository.full_name === MIRROR_REPO;
        if (!refOk || !repoOk) {
          return json({ ok: true, ignored: "ref/repo mismatch", ref: payload.ref });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let report: Awaited<ReturnType<typeof compareWithGitHub>> | null = null;
        let error: string | null = null;
        try { report = await compareWithGitHub(); }
        catch (e) { error = (e as Error).message; }

        // Fan out a mirror_check event to every user so each dashboard sees
        // the fresh status — keeps the integration zero-config for new users.
        const users = await supabaseAdmin.from("bot_config").select("user_id");
        const rows = (users.data ?? []).map((u) => ({
          user_id: u.user_id,
          level: error ? "error" : report?.in_sync ? "info" : "warn",
          source: "mirror_check",
          message: error
            ? `Webhook mirror check failed: ${error}`
            : report?.in_sync
              ? `Webhook: in sync at ${report.head_sha.slice(0, 7)} (push ${payload.after?.slice(0, 7)})`
              : `Webhook: drift after push ${payload.after?.slice(0, 7)} — ${report?.mismatches ?? 0} mismatches`,
          context: {
            trigger: "github_webhook",
            delivery,
            push_after: payload.after,
            head_sha: report?.head_sha,
            matches: report?.matches,
            mismatches: report?.mismatches,
            missing_local: report?.missing_local,
            missing_remote: report?.missing_remote,
            error,
          } as never,
        }));
        if (rows.length) await supabaseAdmin.from("system_events").insert(rows);

        return json({
          ok: true,
          delivery,
          fanout: rows.length,
          report: report && {
            head_sha: report.head_sha,
            in_sync: report.in_sync,
            mismatches: report.mismatches,
            missing_local: report.missing_local,
            missing_remote: report.missing_remote,
          },
          error,
        });
      },
    },
  },
});