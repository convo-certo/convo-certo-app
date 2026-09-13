import type { Route } from "./+types/perform";
import { PerformanceView } from "~/components/PerformanceView";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto — あなたの席で共奏する" },
    {
      name: "description",
      content: "MusicXMLから担当を選び、楽譜を見ながらオーケストラやピアノ伴奏と練習する。",
    },
  ];
}

export default function Perform() {
  return <PerformanceView />;
}
