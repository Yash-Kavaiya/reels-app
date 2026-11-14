import { type ComponentType, useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { CleanEducation } from "./CleanEducation";
import { loadTemplateFonts } from "./fonts";
import type { ReelProps } from "./types";

const COMPONENTS: Record<string, ComponentType<ReelProps>> = {
  "clean-education": CleanEducation,
};

/** Renders a project with its template. Holds the frame until fonts are ready. */
export function ReelComposition(props: ReelProps) {
  const [handle] = useState(() => delayRender("Loading template fonts"));

  useEffect(() => {
    loadTemplateFonts().finally(() => continueRender(handle));
  }, [handle]);

  const Template = COMPONENTS[props.project.template.templateId];
  if (!Template) {
    throw new Error(`Unknown template "${props.project.template.templateId}"`);
  }
  return (
    <AbsoluteFill>
      <Template {...props} />
    </AbsoluteFill>
  );
}
