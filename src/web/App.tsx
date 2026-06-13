import { useEffect, useState } from 'react';
import { fetchStatus } from './apiClient';

export function App() {
  const [status, setStatus] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus().then(setStatus).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Local Agent WeChat Bridge</h1>
      <section>
        <h2>Daemon status</h2>
        {error ? <pre>{error}</pre> : <pre>{JSON.stringify(status, null, 2)}</pre>}
      </section>
    </main>
  );
}
