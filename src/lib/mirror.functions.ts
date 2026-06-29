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