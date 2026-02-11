import type { Route } from "./+types/step1";
import { Step1PlaybackView } from "~/components/Step1PlaybackView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Step 1: Score Display + Playback" },
    {
      name: "description",
      content: "Load MusicXML, display the score and play accompaniment audio.",
    },
  ];
}

export default function Step1() {
  return <Step1PlaybackView />;
}
