import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrShareOverlay({ onClose }) {
  const [url, setUrl] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        let target = data.publicUrl || window.location.origin;
        // If health still returned loopback but we're on a LAN host, prefer that
        if (/127\.0\.0\.1|localhost/i.test(target) && window.location.hostname) {
          const host = window.location.hostname;
          if (host && host !== "localhost" && host !== "127.0.0.1") {
            target = window.location.origin;
          }
        }
        if (cancelled) return;
        setUrl(target);
        const png = await QRCode.toDataURL(target, {
          width: 280,
          margin: 2,
          color: { dark: "#1a0d05", light: "#fff8f1" },
        });
        if (!cancelled) setDataUrl(png);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not build QR code");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Share app QR code"
      onClick={onClose}
    >
      <div className="sheet sheet-qr" onClick={(e) => e.stopPropagation()}>
        <h2>Open on phone</h2>
        <p>Scan to open Traeger on the same Wi‑Fi.</p>
        {error && <p className="qr-error">{error}</p>}
        {dataUrl ? (
          <img className="qr-image" src={dataUrl} alt={`QR code for ${url}`} />
        ) : (
          !error && <div className="chart-empty">Building QR…</div>
        )}
        {url && <p className="qr-url">{url}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
