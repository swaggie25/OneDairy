import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeScan } from "@/lib/qr";
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";

/**
 * Camera QR scanner with a manual-entry fallback (cameras are unreliable in
 * the field). Loads html5-qrcode only in the browser, after mount.
 *
 * html5-qrcode throws "Cannot stop, scanner is not running or paused" if
 * .stop() is called while it isn't actively scanning/paused — which happens
 * whenever a successful scan (which stops the camera itself) is immediately
 * followed by the dialog closing and this component's unmount cleanup also
 * calling .stop(). We guard every stop with a state check so it only ever
 * fires while the scanner is actually running.
 */
export function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (code: string) => void;
  onClose?: () => void;
}) {
  const containerId = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hasResult = false;
    let instance: Html5QrcodeType | null = null;

    const safeStop = async () => {
      if (!instance) return;
      try {
        const { Html5QrcodeScannerState } = await import("html5-qrcode");
        const state = instance.getState();
        const canStop =
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED;
        if (canStop) await instance.stop();
      } catch {
        // Already stopped, stopping, or never started — nothing to do.
      }
      try {
        instance.clear();
      } catch {
        // Container already gone (e.g. dialog closed) — nothing to do.
      }
    };

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        instance = new Html5Qrcode(containerId);
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (hasResult || cancelled) return;
            hasResult = true;
            onResult(normalizeScan(decoded));
            void safeStop();
          },
          () => {},
        );
      } catch {
        if (!cancelled) setError("Camera unavailable — type the card code instead.");
      }
    })();

    return () => {
      cancelled = true;
      void safeStop();
    };
  }, [containerId, onResult]);

  return (
    <div className="space-y-3">
      <div id={containerId} className="overflow-hidden rounded-xl bg-secondary" />
      {error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Camera className="h-4 w-4" /> {error}
        </p>
      )}
      <div className="flex gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="DO-F-F001"
          className="h-12"
          aria-label="Card code"
        />
        <Button
          className="h-12"
          onClick={() => manual.trim() && onResult(normalizeScan(manual))}
        >
          Look up
        </Button>
      </div>
      {onClose && (
        <Button variant="ghost" className="w-full" onClick={onClose}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      )}
    </div>
  );
}
