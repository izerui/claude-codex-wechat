export async function fetchStatus(): Promise<unknown> {
  const response = await fetch('/api/status');
  if (!response.ok) throw new Error(`status_failed:${response.status}`);
  return await response.json();
}
