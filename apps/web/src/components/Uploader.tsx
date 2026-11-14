"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { uploadVideo } from "@/lib/api";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function Uploader() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("This file is larger than 500 MB. Trim it or export a smaller copy first.");
        return;
      }
      setProgress(0);
      try {
        router.push(`/reels/${await uploadVideo(file, setProgress)}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The upload failed.");
        setProgress(null);
      }
    },
    [router],
  );

  const uploading = progress !== null;

  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!uploading) void upload(event.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 text-center focus-within:ring-2 focus-within:ring-blue-400 ${
          uploading ? "cursor-progress" : "cursor-pointer"
        } ${dragging ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}
      >
        {uploading ? (
          <>
            <span className="text-lg font-semibold text-slate-900">
              Uploading… {Math.round(progress * 100)}%
            </span>
            <progress className="h-2 w-64" value={progress} max={1} aria-label="Upload progress" />
          </>
        ) : (
          <>
            <span className="text-lg font-semibold text-slate-900">Drop a video here</span>
            <span className="max-w-md text-sm text-slate-600">
              or click to choose one. Captions, headline and the finished vertical video are made
              for you. MP4, MOV or WebM, up to 500 MB; the first 3 minutes are used.
            </span>
          </>
        )}
        <input
          type="file"
          accept="video/*,.mkv"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </label>
      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
