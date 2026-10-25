/**
 * Turns a User-Agent header into a short label for the signed-in devices list
 * (S4-04). Only the label is stored, so the full header (with versions and
 * build numbers) never reaches the database.
 */
export function describeUserAgent(userAgent: string | undefined): string {
  const value = (userAgent ?? "").slice(0, 512);
  if (!value) return "Unknown device";

  const browser = /Edg\//.test(value)
    ? "Edge"
    : /OPR\/|Opera/.test(value)
      ? "Opera"
      : /Firefox\//.test(value)
        ? "Firefox"
        : /HeadlessChrome|Chrome\/|CriOS\//.test(value)
          ? "Chrome"
          : /Safari\//.test(value)
            ? "Safari"
            : null;
  const platform = /iPhone|iPad|iPod/.test(value)
    ? "iOS"
    : /Android/.test(value)
      ? "Android"
      : /Windows/.test(value)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(value)
          ? "macOS"
          : /CrOS/.test(value)
            ? "ChromeOS"
            : /Linux/.test(value)
              ? "Linux"
              : null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? "Unknown device";
}
