import { deployment } from "@/lib/oauth/config";

/**
 * Tonight's MCP address, as somebody should type it into a host.
 *
 * The same value the OAuth metadata publishes as the protected resource, so the
 * address on the setup page cannot come to differ from the one clients are told
 * to use.
 *
 * Answers `null` rather than throwing. A deployment with no `PUBLIC_ORIGIN` is
 * misconfigured, but a setup page that explains what Tonight is and cannot print
 * one URL is still worth more to a reader than an error page — and the pages that
 * call this render the surrounding guide either way.
 */
export function mcpEndpoint(): string | null {
  try {
    return deployment().resource;
  } catch (error) {
    console.error(
      `[tonight] setup: could not resolve the MCP endpoint: ` +
        `${error instanceof Error ? error.message : "unknown error"}`,
    );
    return null;
  }
}
