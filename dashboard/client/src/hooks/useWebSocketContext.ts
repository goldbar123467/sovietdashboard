import { createContext, useContext } from "react";

interface WsApi {
  connected: boolean;
  on: (type: string, cb: (data: any) => void) => () => void;
  send: (msg: any) => void;
}

const noop: WsApi = {
  connected: false,
  on: () => () => {},
  send: () => {},
};

export const WsContext = createContext<WsApi>(noop);

export function useWebSocketContext(): WsApi {
  return useContext(WsContext);
}
