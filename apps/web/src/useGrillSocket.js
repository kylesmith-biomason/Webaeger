import { useEffect, useRef, useState } from "react";

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function useGrillSocket() {
  const [latest, setLatest] = useState(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(1000);

  useEffect(() => {
    let socket;
    let closed = false;
    let timer;

    function connect() {
      socket = new WebSocket(wsUrl());

      socket.addEventListener("open", () => {
        setConnected(true);
        retryRef.current = 1000;
      });

      socket.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "hello" || msg.type === "temp") {
            setLatest({
              celsius: msg.celsius,
              fahrenheit: msg.fahrenheit,
              display: msg.display,
              unit: msg.unit,
              recordedAt: msg.recordedAt,
              error: msg.error ?? null,
              activeCook: msg.activeCook ?? null,
              readingId: msg.readingId ?? null,
            });
          }
          if (msg.type === "cook") {
            setLatest((prev) =>
              prev
                ? { ...prev, activeCook: msg.cook }
                : { activeCook: msg.cook }
            );
          }
        } catch {
          // ignore malformed frames
        }
      });

      socket.addEventListener("close", () => {
        setConnected(false);
        if (closed) return;
        timer = setTimeout(connect, retryRef.current);
        retryRef.current = Math.min(retryRef.current * 1.5, 8000);
      });
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return { latest, connected };
}
