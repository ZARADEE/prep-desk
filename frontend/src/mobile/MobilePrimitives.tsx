import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './mobile.css';

export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(() => matchMedia('(max-width: 700px)').matches);
  useEffect(() => { const query = matchMedia('(max-width: 700px)'); const update = () => setSmall(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  return small;
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current; dialog?.showModal();
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="mobile-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <header><strong>{title}</strong><button type="button" onClick={onClose} aria-label={`关闭${title}`}>关闭 ×</button></header>
    <div className="mobile-dialog-body">{children}</div>
  </dialog>, document.body);
}

export function ResponsiveSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }): JSX.Element | null {
  const small = useSmallScreen();
  return small ? open ? <Sheet title={title} onClose={onClose}>{children}</Sheet> : null : <>{children}</>;
}

export function MobileRuntime(): JSX.Element | null {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (matchMedia('(max-width: 700px)').matches && target instanceof HTMLImageElement && target.matches('.practice-question-image,.wrong-book-question-image,.exam-question-image,.study-preview img,.question-explanation img,[data-zoom]')) {
        setScale(1); setImage({ src: target.currentSrc || target.src, alt: target.alt });
      }
    };
    const viewport = () => {
      const gap = Math.max(0, innerHeight - (visualViewport?.height ?? innerHeight) - (visualViewport?.offsetTop ?? 0));
      document.documentElement.style.setProperty('--keyboard-gap', `${gap}px`);
      document.documentElement.classList.toggle('keyboard-open', gap > 120);
    };
    document.addEventListener('click', open); visualViewport?.addEventListener('resize', viewport); viewport();
    return () => { document.removeEventListener('click', open); visualViewport?.removeEventListener('resize', viewport); };
  }, []);
  return image && <Sheet title={image.alt || '题面图片'} onClose={() => setImage(null)}>
    <div className="mobile-zoom-controls"><button onClick={() => setScale(value => Math.max(1, value - .5))}>缩小 −</button><span>{Math.round(scale * 100)}%</span><button onClick={() => setScale(value => Math.min(4, value + .5))}>放大 ＋</button><button onClick={() => setScale(1)}>适合屏幕</button></div>
    <div className="mobile-image-scroll"><img src={image.src} alt={image.alt} style={{ width: `${scale * 100}%`, maxWidth: 'none' }} /></div>
  </Sheet>;
}
