import { createProject } from "@reelcraft/project";
import { Composition } from "remotion";
import { ReelComposition } from "./ReelComposition";
import { compositionMetadata } from "./timeline";
import type { ReelProps } from "./types";

export const REEL_COMPOSITION_ID = "Reel";

const defaultProps: ReelProps = {
  project: createProject({ id: "default", name: "Default", durationFrames: 300 }),
  assetUrls: {},
};

export function Root() {
  return (
    <Composition
      id={REEL_COMPOSITION_ID}
      component={ReelComposition}
      defaultProps={defaultProps}
      {...compositionMetadata(defaultProps.project)}
      calculateMetadata={({ props }) => ({
        ...compositionMetadata(props.project),
        ...(props.overlayFrames ? { durationInFrames: props.overlayFrames.length } : null),
      })}
    />
  );
}
