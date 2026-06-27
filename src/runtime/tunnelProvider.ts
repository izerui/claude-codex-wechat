export type TunnelStatusView = {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error';
  publicUrl?: string;
  error?: string;
};

export type TunnelProvider = {
  getStatus(): Promise<TunnelStatusView>;
  start(): Promise<TunnelStatusView>;
  stop(): Promise<TunnelStatusView>;
  setEnabled(enabled: boolean): Promise<TunnelStatusView>;
};
