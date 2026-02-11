import type { Route } from "./+types/step4";
import { Step4RehearsalView } from "~/components/Step4RehearsalView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Step 4: Full Rehearsal" },
    {
      name: "description",
      content:
        "Voice commands, pose detection, reference audio and all features.",
    },
  ];
}

export default function Step4() {
  return <Step4RehearsalView />;
}
