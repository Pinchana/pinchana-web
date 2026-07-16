import {getTranslations} from "next-intl/server";

export async function apiError(key: string, status: number) {
  const t = await getTranslations("apiErrors");
  return Response.json({error: t(key)}, {status});
}
