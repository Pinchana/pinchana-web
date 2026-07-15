const KIBIBYTE = 1024;
const LARGE_DOWNLOAD_BYTES = KIBIBYTE ** 3;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function dlpDownloadPath(jobId: string): string {
  if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid private download job.");
  return `/api/dlp/jobs/${jobId}/file`;
}

export function formatDownloadSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KiB", "MiB", "GiB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= KIBIBYTE && unit < units.length - 1) {
    value /= KIBIBYTE;
    unit += 1;
  }
  const fractionDigits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unit]}`;
}

export function isLargeDownload(bytes: number | null): boolean {
  return bytes !== null && Number.isFinite(bytes) && bytes >= LARGE_DOWNLOAD_BYTES;
}
