import type { Route } from "./+types/step3";
import { Step3AdaptiveView } from "~/components/Step3AdaptiveView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Step 3: Adaptive Accompaniment" },
    {
      name: "description",
      content:
        "HMM score follower tracks your position and adapts accompaniment tempo.",
    },
  ];
}

export default function Step3() {
  return <Step3AdaptiveView />;
}
