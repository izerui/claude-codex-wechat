declare module '../../relay-server/src/server.mjs' {
  export function startRelayServer(input: {
    port: number;
    authTokens: string[];
    requestTimeoutMs?: number;
  }): Promise<{
    port: number;
    close(): Promise<void>;
  }>;
}
