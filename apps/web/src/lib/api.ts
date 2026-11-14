import type { Project } from "@reelcraft/project";
import type { ReelSummary } from "./server";

export type { ReelSummary };

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body;
}

export const listReels = () => fetch("/api/reels").then((r) => json<{ reels: ReelSummary[] }>(r));

export const getReel = (id: string) =>
  fetch(`/api/reels/${id}`).then((r) => json<{ reel: ReelSummary; project: Project | null }>(r));

export const saveProject = (id: string, project: Project) =>
  fetch(`/api/reels/${id}/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  }).then((r) => json<{ ok: true }>(r));

/** Starts a re-export, or retries automatic creation if the reel has no project yet. */
export const startJob = (id: string) =>
  fetch(`/api/reels/${id}/jobs`, { method: "POST" }).then((r) => json<{ reel: ReelSummary }>(r));

export const cancelJob = (id: string) =>
  fetch(`/api/reels/${id}/jobs`, { method: "DELETE" }).then((r) => json<{ reel: ReelSummary }>(r));

export const fileUrl = (id: string, name: string, version?: number) =>
  `/api/reels/${id}/files/${name}${version ? `?v=${version}` : ""}`;

/** Uploads a video and reports progress from 0 to 1. Resolves with the new reel's id. */
export function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    // XMLHttpRequest, because fetch cannot report upload progress.
    const request = new XMLHttpRequest();
    request.open("POST", "/api/reels");
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    request.onload = () => {
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // fall through to the generic error
      }
      if (request.status === 201 && body.id) resolve(body.id);
      else reject(new Error(body.error ?? `The upload failed (${request.status}).`));
    };
    request.send(file);
  });
}
