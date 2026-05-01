import React from "react";
import { Composition } from "remotion";
import { TransNovelIntro, TOTAL_DURATION } from "./TransNovelIntro";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TransNovelIntro"
        component={TransNovelIntro}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
