export type ErrorMechanism =
  | "manual"
  | "onerror"
  | "unhandledrejection"
  | "react_error_boundary";

export type ErrorSeverity = "error" | "warning" | "info";

export type ErrorReportOptions = {
  mechanism?: ErrorMechanism;
  handled?: boolean;
  severity?: ErrorSeverity;
};

export function reportAppError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  const payload = {
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    options: {
      mechanism: "manual" as ErrorMechanism,
      handled: false,
      severity: "error" as ErrorSeverity,
      ...options,
    },
  };

  if (typeof window !== "undefined") {
    payload.context = {
      route: window.location.pathname,
      ...context,
    };
  }

  console.error("[AppError]", payload);
}
