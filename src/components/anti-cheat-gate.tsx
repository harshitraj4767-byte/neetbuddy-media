import { useEffect, useState } from "react";
import { ShieldAlert, Camera, Code2, ClipboardX, MousePointerSquareDashed, EyeOff, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const ACK_VERSION = "v1";
const STORAGE_PREFIX = "anticheat-ack:";

type Mode = "battle" | "contest";

const RULES: { icon: typeof ShieldAlert; text: string }[] = [
  { icon: Camera, text: "No screenshots, screen recording, or screen sharing of any kind." },
  { icon: Code2, text: "No DevTools, view-source, or browser shortcuts (F12, Ctrl+Shift+I, Ctrl+U)." },
  { icon: ClipboardX, text: "No copy, cut, paste, or text selection — answers must come from you." },
  { icon: MousePointerSquareDashed, text: "No drag-and-drop, right-click menus, or printing." },
  { icon: EyeOff, text: "Don't switch tabs, apps, or open AI assistants (ChatGPT, Gemini, Copilot, floating windows)." },
  { icon: MonitorSmartphone, text: "Leaving the screen for more than 10 seconds will auto-submit your attempt." },
];

function ackKey(mode: Mode, scopeId: string) {
  return `${STORAGE_PREFIX}${mode}:${scopeId}:${ACK_VERSION}`;
}

export function hasAckedAntiCheat(mode: Mode, scopeId: string): boolean {
  if (typeof window === "undefined") return false;
  try { return !!localStorage.getItem(ackKey(mode, scopeId)); } catch { return false; }
}

interface Props {
  mode: Mode;
  /** Unique id to scope the acknowledgement (matchId, contestId, testId). */
  scopeId: string;
  /** Called once the user accepts the rules. */
  onAccept: () => void;
  /** Optional cancel — e.g. back to lobby. If omitted, no cancel button is rendered. */
  onCancel?: () => void;
}

/**
 * Modal gate shown before a paid/timed activity (battles, contests). User must
 * tick the box and click "I agree" before the screen unlocks. Acknowledgement
 * is recorded in localStorage so refreshes don't re-prompt.
 */
export function AntiCheatGate({ mode, scopeId, onAccept, onCancel }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (hasAckedAntiCheat(mode, scopeId)) {
      setOpen(false);
      onAccept();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scopeId]);

  if (!open) return null;

  const title = mode === "battle" ? "Fair-play rules — Battle" : "Fair-play rules — Contest";

  function accept() {
    if (!agreed) return;
    try {
      localStorage.setItem(ackKey(mode, scopeId), JSON.stringify({
        ackedAt: new Date().toISOString(),
        ua: navigator.userAgent,
        version: ACK_VERSION,
      }));
    } catch { /* storage disabled — proceed anyway */ }
    setOpen(false);
    onAccept();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anticheat-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-elegant">
        <div className="bg-gradient-to-br from-rose-500 via-orange-500 to-amber-500 px-5 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <ShieldAlert className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-90">Anti-cheat notice</div>
              <h2 id="anticheat-title" className="text-lg font-extrabold leading-tight">{title}</h2>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/90">
            We monitor for cheating. Violations auto-submit your attempt and may forfeit your stake.
            Read every rule below before continuing.
          </p>
        </div>

        <ul className="space-y-2.5 px-5 py-5">
          {RULES.map((r) => (
            <li key={r.text} className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span className="text-[13px] leading-snug text-foreground">{r.text}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border bg-background/40 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5"
              aria-label="I have read and will follow the fair-play rules"
            />
            <span className="leading-snug">
              I have read the rules and agree that any violation will auto-submit my attempt.
            </span>
          </label>
          <div className="mt-4 flex gap-2">
            {onCancel && (
              <Button variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              className="flex-1 bg-rose-600 text-white hover:bg-rose-700"
              disabled={!agreed}
              onClick={accept}
            >
              I agree — start
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
