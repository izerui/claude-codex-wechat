declare module '../../relay-server/src/server.mjs' {
  export function startRelayServer(input: {
    port: number;
    baseDomain: string;
    authToken: string;
  }): Promise<{
    port: number;
    close(): Promise<void>;
  }>;
}
