declare module '../../relay-server/src/server.mjs' {
  export function startRelayServer(input: {
    port: number;
    baseDomain: string;
    authTokens: string[];
  }): Promise<{
    port: number;
    close(): Promise<void>;
  }>;
}
