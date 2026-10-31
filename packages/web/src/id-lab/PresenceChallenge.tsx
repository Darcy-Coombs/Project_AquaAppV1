import React, { useEffect, useRef, useState } from "react";
import { hex, randomBytes, type CeremonyResult } from "./core.js";

export function PresenceChallenge({ onComplete, onCancel }: { onComplete: (result: CeremonyResult) => Promise<void>; onCancel: () => void }) {
  const [challengeId] = useState(() => hex(randomBytes()));
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(() => randomBytes(1)[0]! % 4);
  const [readyAt, setReadyAt] = useState(() => performance.now() + 5000);
  const [remaining, setRemaining] = useState(5);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const clicked = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((readyAt - performance.now()) / 1000))), 100);
    return () => window.clearInterval(timer);
  }, [readyAt]);
  async function select(index: number) {
    if (clicked.current || performance.now() < readyAt) return;
    if (index !== target) { setError("Try the indicated target."); return; }
    clicked.current = true;
    setError("");
    if (step === 4) {
      setFinishing(true);
      try {
        await onComplete({ version: "aqua-presence:v1", challengeId, completedAt: new Date().toISOString(), passed: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save. Cancel and try again.");
        setFinishing(false);
        clicked.current = false;
      }
    } else {
      setStep(step + 1); setTarget(randomBytes(1)[0]! % 4);
      setReadyAt(performance.now() + 5000); setRemaining(5);
      clicked.current = false;
    }
  }
  return <section className="lab-card" aria-label="Human Presence Challenge">
    <h3>Human Presence Challenge</h3>
    <p>Five short rounds, roughly 25–30 seconds. Wait, then select the randomly indicated target. This demonstrates interaction, not unique humanity; automation can pass it.</p>
    <p aria-live="polite">Round {step + 1} of 5 · {remaining > 0 ? `Wait ${remaining}s` : `Select target ${target + 1}`}</p>
    <div className="lab-targets">{[0, 1, 2, 3].map(index => <button key={index} disabled={remaining > 0 || finishing} aria-label={`Target ${index + 1}`} data-indicated={index === target && remaining === 0} onClick={() => void select(index)}>{index + 1}{index === target && remaining === 0 ? " ← select" : ""}</button>)}</div>
    <p>No tap timings, target sequence, or behavioural traces are saved.</p>
    {error && <p role="alert">{error}</p>}
    <button className="ghost-button" disabled={finishing} onClick={onCancel}>Cancel challenge</button>
  </section>;
}
