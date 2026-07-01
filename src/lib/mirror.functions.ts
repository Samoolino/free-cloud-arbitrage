import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Run a fresh integrity check between local bundle and GitHub HEAD. */
export const checkMirrorIntegrity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { compareWithGitHub } = await import("@/lib/github-mirror.server");
    const report = await compareWithGitHub();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("system_events").insert({
      user_id: context.userId,
      level: report.in_sync ? "info" : "warn",
      source: "mirror_check",
      message: report.in_sync
        ? `Mirror in sync at ${report.head_sha.slice(0, 7)}`
        : `Mirror drift: ${report.mismatches} mismatches, ${report.missing_local} missing locally`,
      context: {
        head_sha: report.head_sha,
        matches: report.matches,
        mismatches: report.mismatches,
        missing_local: report.missing_local,
        missing_remote: report.missing_remote,
        diffs: report.diffs.filter((d) => d.status !== "match").slice(0, 50),
      } as never,
    });
    return report;
  });

/** Returns the raw GitHub content for every drifting file so the operator
 *  can paste/commit it. Persisting to disk inside the Worker is impossible. */
export const fetchMirrorBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ head_sha: z.string().optional() }).parse(i))
  .handler(async () => {
    const { compareWithGitHub, fetchMirrorPatch } = await import("@/lib/github-mirror.server");
    const report = await compareWithGitHub();
    const patch = await fetchMirrorPatch(report);
    return { report, patch };
  });

/** Last recorded mirror check. */
export const lastMirrorCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.from("system_events").select("*")
      .eq("user_id", context.userId).eq("source", "mirror_check")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  });

/** Send a signed sample push payload to our own webhook endpoint and report
 *  whether HMAC verification + integrity re-check succeeded. Uses the same
 *  GITHUB_WEBHOOK_SECRET the real webhook is configured with. */
export const testGithubWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return { ok: false, error: "GITHUB_WEBHOOK_SECRET not configured" };
    }
    const { fetchHeadCommit, MIRROR_REPO, MIRROR_BRANCH } = await import(
      "@/lib/github-mirror.server"
    );
    const head = await fetchHeadCommit();
    const payload = {
      ref: `refs/heads/${MIRROR_BRANCH}`,
      after: head.sha,
      repository: { full_name: MIRROR_REPO },
      _test: true,
    };
    const raw = JSON.stringify(payload);
    const { createHmac } = await import("node:crypto");
    const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = new URL(req.url).origin;
    const url = `${origin}/api/public/github/webhook`;
    const started = Date.now();
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": `test-${Date.now()}`,
        "X-Hub-Signature-256": sig,
      },
      body: raw,
    });
    const took_ms = Date.now() - started;
    const text = await r.text();
    let body: Record<string, unknown> | string = text;
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* keep text */ }
    return {
      ok: r.ok,
      status: r.status,
      signature_valid: r.status !== 401,
      took_ms,
      url,
      response: body,
    };
  });