import { useEffect, useRef, useState } from 'react';
import { DirectoryTree } from './DirectoryTree';

export function DirectoryPicker(input: { value: string; onChange(path: string): void; ariaLabel?: string }) {
  const { value, onChange, ariaLabel } = input;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="dir-picker position-relative w-100" ref={ref}>
      <button
        type="button"
        className="form-control form-control-sm d-flex align-items-center gap-2 text-start"
        onClick={() => setOpen((prev) => !prev)}
        title={value || ''}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <i className="bi bi-folder2-open text-muted-soft flex-shrink-0" />
        <span className="font-monospace text-truncate flex-grow-1">{value || '选择工作目录…'}</span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'} flex-shrink-0`} />
      </button>
      {open ? (
        <div
          className="dir-picker-pop position-absolute bg-white border rounded shadow-sm p-2"
          style={{ zIndex: 1050, left: 0, right: 0, top: '100%', marginTop: 4 }}
        >
          <DirectoryTree
            value={value}
            showHeader={false}
            onChange={(path) => {
              onChange(path);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
