import type { Route } from "./+types/step2";
import { Step2KaraokeView } from "~/components/Step2KaraokeView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Step 2: Karaoke Mode" },
    {
      name: "description",
      content:
        "Play your instrument via MIDI input. Accompaniment runs at fixed tempo.",
    },
  ];
}

export default function Step2() {
  return <Step2KaraokeView />;
}
