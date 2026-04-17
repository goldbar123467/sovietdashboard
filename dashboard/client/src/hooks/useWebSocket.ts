import { useEffect, useRef, useCallback, useState } from "react";

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const on = useCallback((type: string, cb: (data: any) => void) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(cb);
    return () => { listenersRef.current.get(type)?.delete(cb); };
  }, []);

  const send = useCallback((msg: any) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const cbs = listenersRef.current.get(msg.type);
          if (cbs) cbs.forEach((cb) => cb(msg.data ?? msg));
        } catch {}
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, on, send };
}
