export type TunnelStatusView = {
  installed: boolean;
  running: boolean;
  status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error';
  publicUrl?: string;
  error?: string;
};

export type TunnelProvider = {
  getStatus(): Promise<TunnelStatusView>;
  start(): Promise<TunnelStatusView>;
  stop(): Promise<TunnelStatusView>;
};
