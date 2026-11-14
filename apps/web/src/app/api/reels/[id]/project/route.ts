import { safeParseProject } from "@reelcraft/project";
import { notFound, store } from "@/lib/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Saves an edited project. The server re-validates everything the browser sends. */
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  const reel = store().getReel(id);
  if (!reel) return notFound();

  const parsed = safeParseProject(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.id !== id) {
    return Response.json({ error: "The project is not valid and was not saved." }, { status: 400 });
  }
  store().saveProject(id, parsed.data);
  return Response.json({ ok: true });
}
