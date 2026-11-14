"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type ReelSummary, fileUrl, listReels } from "@/lib/api";
import { isBusy, statusLabel } from "./status";

export function ReelList() {
  const [reels, setReels] = useState<ReelSummary[] | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const load = async () => {
      const next = await listReels().then((r) => r.reels, () => null);
      if (stopped) return;
      if (next) setReels(next);
      // Keep refreshing only while something is in progress.
      if (!next || next.some(isBusy)) timer = setTimeout(load, 2000);
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!reels || reels.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">Your reels</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {reels.map((reel) => (
          <li key={reel.id}>
            <Link
              href={`/reels/${reel.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {reel.hasExport ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(reel.id, "cover.jpg", reel.job?.updatedAt)}
                  alt=""
                  className="h-20 w-[45px] rounded object-cover"
                />
              ) : (
                <div className="h-20 w-[45px] rounded bg-slate-200" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{reel.name}</p>
                <p className="text-sm text-slate-600">{statusLabel(reel)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
