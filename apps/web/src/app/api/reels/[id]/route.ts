import { notFound, store, summarize } from "@/lib/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const reel = store().getReel((await params).id);
  if (!reel) return notFound();
  return Response.json({ reel: summarize(reel), project: reel.project });
}
