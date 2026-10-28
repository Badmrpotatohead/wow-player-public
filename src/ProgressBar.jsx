export default function ProgressBar({ elapsed, duration, t }) {
  const pct = duration > 0 ? (elapsed / duration) * 100 : 0;
  const trackBg = t?.trackBg || "rgba(255,255,255,0.1)";
  const progressDot = t?.progressDot || "rgba(30,30,40,0.8)";
  return (
    <div style={{ position: "relative", width: "100%", height: "6px", marginTop: "14px" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6px", backgroundColor: trackBg, borderRadius: "3px" }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: `${pct}%`, height: "6px", background: "linear-gradient(90deg, #5bb8c4, #7c9cf7, #b08fd8)", borderRadius: "3px", transition: "width 0.5s linear" }} />
      <div style={{ position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)", width: "18px", height: "18px", background: "linear-gradient(135deg, #5bb8c4, #7c9cf7)", borderRadius: "50%", boxShadow: "0 2px 10px rgba(91,184,196,0.5)", transition: "left 0.5s linear", border: `2px solid ${progressDot}` }} />
    </div>
  );
}
