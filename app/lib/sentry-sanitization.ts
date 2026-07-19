const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'<>]+/gi;

type SentryRequest = {
  method?: string;
  [key: string]: unknown;
};

type SentryExceptionValue = {value?: string; [key: string]: unknown};
type SentryBreadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type SentryEventLike = {
  message?: string;
  transaction?: string;
  user?: unknown;
  request?: SentryRequest;
  extra?: unknown;
  exception?: {values?: SentryExceptionValue[]; [key: string]: unknown};
  breadcrumbs?: SentryBreadcrumb[];
  [key: string]: unknown;
};

export function redactUrls(value: string): string {
  return value.replace(URL_PATTERN, "[redacted-url]");
}

export function sanitizeSentryBreadcrumb<T>(breadcrumb: T): T {
  const source = breadcrumb as unknown as SentryBreadcrumb;
  const data = source.data;
  const safeData = data
    ? Object.fromEntries(
        Object.entries(data).filter(([key]) => ["method", "status", "status_code"].includes(key.toLowerCase())),
      )
    : undefined;
  return {
    ...source,
    ...(source.message ? {message: redactUrls(source.message)} : {}),
    ...(safeData ? {data: safeData} : {}),
  } as unknown as T;
}

export function sanitizeSentryEvent<T>(event: T): T {
  const source = event as unknown as SentryEventLike;
  const request = source.request
    ? {method: source.request.method}
    : undefined;
  const exception = source.exception?.values
    ? {
        ...source.exception,
        values: source.exception.values.map((value) => ({
          ...value,
          ...(value.value ? {value: redactUrls(value.value)} : {}),
        })),
      }
    : source.exception;

  return {
    ...source,
    user: undefined,
    extra: undefined,
    transaction: undefined,
    ...(source.message ? {message: redactUrls(source.message)} : {}),
    ...(request ? {request} : {}),
    ...(exception ? {exception} : {}),
    ...(source.breadcrumbs ? {breadcrumbs: source.breadcrumbs.map(sanitizeSentryBreadcrumb)} : {}),
  } as unknown as T;
}
