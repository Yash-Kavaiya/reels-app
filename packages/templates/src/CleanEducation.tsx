import type { Clip, Rational } from "@reelcraft/project";
import { usToFrame } from "@reelcraft/project";
import type { CSSProperties } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import { FONT_STACK } from "./fonts";
import { BLUR_BACKGROUND, CLEAN_EDUCATION } from "./registry";
import { activeSegment, ctaStartFrame } from "./timeline";
import type { ReelProps } from "./types";

const textBase: CSSProperties = {
  fontFamily: FONT_STACK,
  textAlign: "center",
  fontWeight: 700,
  // Generous line height keeps Devanagari and Gujarati vowel marks from clipping.
  lineHeight: 1.45,
  overflowWrap: "anywhere",
};

const row = (edge: CSSProperties): CSSProperties => ({
  position: "absolute",
  left: 90,
  right: 90,
  display: "flex",
  justifyContent: "center",
  ...edge,
});

const cssBlur: CSSProperties = {
  filter: `blur(${BLUR_BACKGROUND.blurPx}px) brightness(${BLUR_BACKGROUND.brightness})`,
  transform: `scale(${BLUR_BACKGROUND.scale})`,
};

type ClipLayerProps = { clip: Clip; src: string; background?: string; fps: Rational };

function ClipLayer({ clip, src, background, fps }: ClipLayerProps) {
  const trimBefore = usToFrame(clip.sourceStartUs, fps);
  return (
    <Sequence
      from={clip.outputStartFrame}
      durationInFrames={clip.outputEndFrame - clip.outputStartFrame}
    >
      {clip.fit === "blur-fit" ? (
        <AbsoluteFill>
          <OffthreadVideo
            src={background ?? src}
            trimBefore={trimBefore}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              ...(background ? null : cssBlur),
            }}
          />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill>
        <OffthreadVideo
          src={src}
          trimBefore={trimBefore}
          volume={clip.gain}
          style={{
            width: "100%",
            height: "100%",
            objectFit: clip.fit === "cover" ? "cover" : "contain",
          }}
        />
      </AbsoluteFill>
    </Sequence>
  );
}

export function CleanEducation({ project, assetUrls, backgroundUrls, overlayFrames }: ReelProps) {
  const timelineFrame = useCurrentFrame();
  // In overlay-only mode, composition frame i stands for project frame overlayFrames[i].
  const frame = overlayFrames ? (overlayFrames[timelineFrame] ?? 0) : timelineFrame;
  const tokens = { ...CLEAN_EDUCATION.styleTokens, ...project.template.styleTokens };
  const { headline, callToAction } = project.template.slots;
  const caption = activeSegment(project.captionTracks[0]?.segments ?? [], frame);
  const showCta = Boolean(callToAction) && frame >= ctaStartFrame(project);
  const overlayOnly = overlayFrames !== undefined;
  const clips = overlayOnly ? [] : [...project.clips].sort((a, b) => a.z - b.z);

  return (
    <AbsoluteFill style={overlayOnly ? undefined : { backgroundColor: tokens.surface }}>
      {clips.map((clip) => {
        const src = assetUrls[clip.assetId];
        if (!src) return null;
        const background = backgroundUrls?.[clip.assetId];
        return (
          <ClipLayer key={clip.id} clip={clip} src={src} background={background} fps={project.fps} />
        );
      })}

      {headline ? (
        <div style={row({ top: 170 })}>
          <div
            style={{
              ...textBase,
              color: tokens.text,
              backgroundColor: tokens.accent,
              fontSize: 64,
              padding: "20px 40px",
              borderRadius: 28,
            }}
          >
            {headline}
          </div>
        </div>
      ) : null}

      {caption?.text ? (
        <div style={row({ bottom: 440 })}>
          <div
            style={{
              ...textBase,
              color: tokens.text,
              backgroundColor: tokens.captionBackground,
              fontSize: 58,
              padding: "16px 34px",
              borderRadius: 22,
              whiteSpace: "pre-wrap",
            }}
          >
            {caption.text}
          </div>
        </div>
      ) : null}

      {showCta ? (
        <div style={row({ bottom: 300 })}>
          <div
            style={{
              ...textBase,
              color: tokens.surface,
              backgroundColor: tokens.text,
              fontSize: 46,
              padding: "12px 36px",
              borderRadius: 999,
            }}
          >
            {callToAction}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
