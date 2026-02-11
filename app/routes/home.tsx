import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ConvoCerto - Interactive Music Performance Agent" },
    {
      name: "description",
      content:
        "AI-powered interactive accompaniment system with dynamic Lead/Follow switching, body motion analysis, and voice rehearsal commands.",
    },
  ];
}

const stages = [
  {
    step: 1,
    path: "/step1",
    titleJa: "楽譜表示 + 再生",
    titleEn: "Score Display + Playback",
    descJa: "MusicXML を読み込み、楽譜を表示しながら伴奏を再生します。MIDI入力なし。",
    descEn: "Load MusicXML, display the score and play accompaniment. No MIDI input.",
    color: "#1565c0",
    features: ["MusicXML parsing", "OSMD rendering", "Auto-play engine"],
  },
  {
    step: 2,
    path: "/step2",
    titleJa: "カラオケモード",
    titleEn: "Karaoke Mode",
    descJa: "MIDI 入力で奏者の音を鳴らします。伴奏は固定テンポで進みます。",
    descEn: "Play your instrument via MIDI. Accompaniment runs at fixed tempo.",
    color: "#2e7d32",
    features: ["MIDI input", "Performer sound", "Fixed tempo"],
  },
  {
    step: 3,
    path: "/step3",
    titleJa: "追従伴奏",
    titleEn: "Adaptive Accompaniment",
    descJa: "HMM スコアフォロワーで奏者の位置を追跡し、テンポを合わせます。",
    descEn: "HMM score follower tracks your position and adapts tempo.",
    color: "#e65100",
    features: ["Score following", "Tempo adaptation", "Lead/Follow"],
  },
  {
    step: 4,
    path: "/step4",
    titleJa: "フルリハーサル",
    titleEn: "Full Rehearsal",
    descJa: "音声コマンド、姿勢検出、参考音源など全機能が使えます。",
    descEn: "Voice commands, pose detection, reference audio and all features.",
    color: "#7b1fa2",
    features: ["Voice commands", "Pose detection", "Audio reference", "Dynamic roles"],
  },
] as const;

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background:
          "linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
        padding: 32,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 900, width: "100%" }}>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            margin: 0,
            letterSpacing: -1,
          }}
        >
          ConvoCerto
        </h1>
        <p
          style={{
            fontSize: 20,
            opacity: 0.9,
            marginTop: 12,
            marginBottom: 48,
            lineHeight: 1.6,
          }}
        >
          Interactive Music Performance Agent
          <br />
          <span style={{ fontSize: 16, opacity: 0.7 }}>
            AI accompaniment with dynamic Lead/Follow switching
          </span>
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
            marginBottom: 48,
            textAlign: "left",
          }}
        >
          {stages.map((stage) => (
            <Link
              key={stage.step}
              to={stage.path}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  padding: 20,
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  transition: "transform 0.2s ease, background 0.2s ease",
                  cursor: "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.18)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: stage.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {stage.step}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {stage.titleJa}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.8,
                    lineHeight: 1.5,
                    marginBottom: 12,
                    flex: 1,
                  }}
                >
                  {stage.descJa}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                  }}
                >
                  {stage.features.map((f) => (
                    <span
                      key={f}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.15)",
                        fontSize: 11,
                        opacity: 0.7,
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link
            to="/step1"
            style={{
              display: "inline-block",
              padding: "16px 48px",
              borderRadius: 8,
              background: "#fff",
              color: "#1a237e",
              fontSize: 18,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            Step 1 から始める
          </Link>
          <Link
            to="/perform"
            style={{
              display: "inline-block",
              padding: "16px 32px",
              borderRadius: 8,
              background: "transparent",
              color: "#fff",
              fontSize: 16,
              fontWeight: 500,
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
          >
            Full Mode
          </Link>
        </div>

        <p style={{ marginTop: 32, fontSize: 13, opacity: 0.5 }}>
          Browser + Microphone + Camera + MIDI Controller
        </p>
      </div>
    </div>
  );
}
