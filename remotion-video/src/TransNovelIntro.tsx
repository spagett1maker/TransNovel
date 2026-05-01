import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Dashboard } from "./scenes/01-Dashboard";
import { Marketplace } from "./scenes/02-Marketplace";
import { ListingDetail } from "./scenes/03-ListingDetail";
import { Accepted } from "./scenes/04-Accepted";
import { EditorScene } from "./scenes/05-Editor";
import { ApprovalFlow } from "./scenes/06-ApprovalFlow";
import { Closing } from "./scenes/07-Closing";
import { COLORS } from "./components/common";

// Scene durations (in frames at 30fps)
const SCENES = [
  { component: Dashboard, duration: 420 },       // 14s
  { component: Marketplace, duration: 480 },      // 16s
  { component: ListingDetail, duration: 510 },    // 17s
  { component: Accepted, duration: 420 },          // 14s
  { component: EditorScene, duration: 1080 },      // 36s  (main scene)
  { component: ApprovalFlow, duration: 600 },      // 20s
  { component: Closing, duration: 420 },           // 14s
] as const;

export const TOTAL_DURATION = SCENES.reduce((sum, s) => sum + s.duration, 0); // 3600 frames = 120s

export const TransNovelIntro: React.FC = () => {
  let offset = 0;

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      {SCENES.map(({ component: Component, duration }, index) => {
        const from = offset;
        offset += duration;
        return (
          <Sequence key={index} from={from} durationInFrames={duration}>
            <Component />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
