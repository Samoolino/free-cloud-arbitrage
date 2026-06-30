import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, GitBranch, Download, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import { checkMirrorIntegrity, fetchMirrorBundle, lastMirrorCheck } from "@/lib/mirror.functions";

export const Route = createFileRoute("/_authenticated/sync")({ component: SyncPage });

function SyncPage() {
  const router = useRouter();
  const runCheck = useServerFn(checkMirrorIntegrity);
  const runBundle = useServerFn(fetchMirrorBundle);
  const getLast = useServerFn(lastMirrorCheck);

  const last = useQuery({ queryKey: ["mirror-last"], queryFn: () => getLast() });
  const check = useMutation({
    mutationFn: () => runCheck(),
    onSuccess: () => { last.refetch(); router.invalidate(); },
  });
  const bundle = useMutation({ mutationFn: () => runBundle({ data: {} }) });

  const report = check.data;
  const [copied, setCopied] = useState<string | null>(null);

  // Automatic integrity check on mount — gives instant pass/fail for HEAD.
  useEffect(() => {
    if (!check.isPending && !check.data) check.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When drift exists, eagerly fetch raw file contents so the per-file Copy
  // button is wired without a second click.
  useEffect(() => {
    if (report && !report.in_sync && !bundle.data && !bundle.isPending) bundle.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.head_sha, report?.in_sync]);

  const bundleByPath = new Map(bundle.data?.patch.files.map((f) => [f.path, f] as const) ?? []);

  async function copyFile(path: string) {
    const f = bundleByPath.get(path);
    if (!f) return;
    await navigator.clipboard.writeText(f.content);
    setCopied(path); setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" /> GitHub mirror status
        </h1>
        <p className="text-sm text-muted-foreground">
          Verifies <code>python_worker/</code> and <code>src/routes/_authenticated/</code> in the
          deployed bundle match the connected repository's HEAD commit.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Last check</CardTitle>
          <Button size="sm" onClick={() => check.mutate()} disabled={check.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${check.isPending ? "animate-spin" : ""}`} />
            Run integrity check
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {last.data ? (
            <>
              <div className="text-xs text-muted-foreground">
                {new Date(last.data.created_at).toLocaleString()}
              </div>
              <div>{last.data.message}</div>
            </>
          ) : (
            <div className="text-muted-foreground text-xs">No checks recorded yet.</div>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {report.in_sync ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> In sync</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-500" /> Drift detected</>
              )}
              <Badge variant="outline" className="font-mono text-xs">{report.head_sha.slice(0, 7)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Checked" value={report.files_checked} />
              <Stat label="Match" value={report.matches} tone="ok" />
              <Stat label="Mismatch" value={report.mismatches} tone={report.mismatches ? "warn" : "muted"} />
              <Stat label="Missing" value={report.missing_local + report.missing_remote} tone="muted" />
            </div>
            <div className="border rounded max-h-96 overflow-y-auto divide-y">
              {report.diffs.filter((d) => d.status !== "match").map((d) => (
                <div key={d.path} className="p-2 flex items-center justify-between gap-2 text-xs">
                  <code className="truncate">{d.path}</code>
                  <Badge variant={d.status === "mismatch" ? "destructive" : "outline"}>{d.status}</Badge>
                </div>
              ))}
              {report.in_sync && (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  All {report.matches} mirrored files match commit {report.head_sha.slice(0, 7)}.
                </div>
              )}
            </div>
            {!report.in_sync && (
              <div className="flex flex-col gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => bundle.mutate()} disabled={bundle.isPending}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  {bundle.isPending ? "Fetching raw files…" : "Mirror from GitHub"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Lovable runs on Cloudflare Workers — the deployed bundle is immutable at runtime.
                  This action downloads the canonical content at HEAD so you can paste it into the
                  code editor (or push to <code>{report.repo}/{report.branch}</code>) and the change
                  will sync back automatically.
                </p>
                {bundle.data && (
                  <div className="border rounded divide-y max-h-72 overflow-y-auto">
                    {bundle.data.patch.files.map((f) => (
                      <details key={f.path} className="p-2 text-xs">
                        <summary className="flex items-center justify-between cursor-pointer">
                          <code>{f.path}</code>
                          <Button size="sm" variant="ghost" onClick={(e) => {
                            e.preventDefault();
                            navigator.clipboard.writeText(f.content);
                            setCopied(f.path); setTimeout(() => setCopied(null), 1500);
                          }}>{copied === f.path ? "Copied" : "Copy"}</Button>
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto bg-muted/40 p-2 rounded">{f.content.slice(0, 4000)}</pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "ok" | "warn" | "muted" }) {
  const cls = tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="border rounded p-2">
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}