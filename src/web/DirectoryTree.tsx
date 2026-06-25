import { useCallback, useEffect, useRef, useState } from 'react';
import { listDirectory, type DirectoryEntryView, type DirectoryListingView } from './apiClient';

const ROOT = '/';

// 把绝对路径拆成自顶向下的各级目录链：'/a/b/c' -> ['/a', '/a/b', '/a/b/c']
function ancestorChain(target: string): string[] {
  const parts = target.split('/').filter(Boolean);
  const chain: string[] = [];
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    chain.push(cur);
  }
  return chain;
}

export function DirectoryTree(input: { value: string; onChange(path: string): void; showHeader?: boolean }) {
  const { value, onChange, showHeader = true } = input;
  const [cache, setCache] = useState<Record<string, DirectoryListingView>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  const markLoading = useCallback((key: string, on: boolean) => {
    setLoading((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const load = useCallback(async (path: string): Promise<void> => {
    markLoading(path, true);
    try {
      const listing = await listDirectory(path, value || undefined);
      setCache((prev) => ({ ...prev, [listing.path]: listing }));
      setError(null);
    } catch {
      setError('无法读取该目录');
    } finally {
      markLoading(path, false);
    }
  }, [markLoading, value]);

  useEffect(() => {
    void (async () => {
      await load(ROOT);
      if (value && value.startsWith('/')) {
        const chain = ancestorChain(value);
        setExpanded((prev) => new Set([...prev, ...chain]));
        await Promise.all(chain.map((path) => load(path)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!cache[path]) void load(path);
      }
      return next;
    });
  }, [cache, load]);

  // 浮层/树首次渲染出选中行后，把它在内部滚动容器里居中定位（只滚容器，不动整页）
  useEffect(() => {
    if (didScrollRef.current) return;
    const container = bodyRef.current;
    const target = selectedRef.current;
    if (!container || !target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    container.scrollTop += (tRect.top - cRect.top) - (container.clientHeight - target.clientHeight) / 2;
    didScrollRef.current = true;
  });

  const renderNode = (entry: DirectoryEntryView, depth: number) => {
    const isOpen = expanded.has(entry.path);
    const isSelected = entry.path === value;
    const childListing = cache[entry.path];
    return (
      <div key={entry.path}>
        <div
          ref={isSelected ? selectedRef : undefined}
          className={`dir-tree-row d-flex align-items-center gap-1 ${isSelected ? 'dir-tree-row-selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 16 }}
        >
          <button
            type="button"
            className="dir-tree-chevron btn btn-sm p-0 border-0 bg-transparent d-inline-flex"
            onClick={() => toggle(entry.path)}
            aria-label={isOpen ? '折叠' : '展开'}
          >
            <i className={`bi ${isOpen ? 'bi-chevron-down' : 'bi-chevron-right'}`} />
          </button>
          <button
            type="button"
            className="dir-tree-name btn btn-sm p-0 border-0 bg-transparent d-inline-flex align-items-center gap-1 text-truncate"
            onClick={() => onChange(entry.path)}
            title={entry.path}
          >
            <i className={`bi ${isOpen ? 'bi-folder2-open' : 'bi-folder'}`} />
            <span className="text-truncate">{entry.name}</span>
          </button>
        </div>
        {isOpen ? (
          loading.has(entry.path) ? (
            <div className="text-muted-soft small" style={{ paddingLeft: 6 + (depth + 1) * 16 }}>加载中…</div>
          ) : childListing ? (
            childListing.entries.length ? (
              childListing.entries.map((child) => renderNode(child, depth + 1))
            ) : (
              <div className="text-muted-soft small" style={{ paddingLeft: 6 + (depth + 1) * 16 }}>（无子目录）</div>
            )
          ) : null
        ) : null}
      </div>
    );
  };

  const rootListing = cache[ROOT];
  return (
    <div className="dir-tree w-100">
      {showHeader ? (
        <div className="dir-tree-head d-flex align-items-center gap-2 mb-1">
          <i className="bi bi-hdd flex-shrink-0 text-muted-soft" />
          <span className="font-monospace small text-truncate" title={value || ''}>
            {value || '（未选择目录）'}
          </span>
        </div>
      ) : null}
      <div ref={bodyRef} className="dir-tree-body border rounded" style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
        {error ? (
          <div className="text-danger small px-1">{error}</div>
        ) : rootListing ? (
          rootListing.entries.length ? (
            rootListing.entries.map((entry) => renderNode(entry, 0))
          ) : (
            <div className="text-muted-soft small px-1">（无子目录）</div>
          )
        ) : (
          <div className="text-muted-soft small px-1">加载中…</div>
        )}
      </div>
    </div>
  );
}
