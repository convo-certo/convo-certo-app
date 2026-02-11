import type { Route } from "./+types/perform";
import { PerformanceView } from "~/components/PerformanceView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Performance" },
    {
      name: "description",
      content: "ConvoCerto interactive accompaniment performance view.",
    },
  ];
}

export default function Perform() {
  return <PerformanceView />;
}
