import { useEffect, useState, type ReactNode } from 'react';

export function QuestionImage({ src, alt, className, fallback }: {
  src: string;
  alt: string;
  className: string;
  fallback: ReactNode;
}): JSX.Element {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setFailedSource(null);
    setRetry(0);
  }, [src]);

  if (failedSource === src) {
    return <div className="question-image-fallback" role="status">
      <strong>原版题图暂时无法加载，仍可继续查看文字题面。</strong>
      {fallback}
      <button type="button" onClick={() => { setFailedSource(null); setRetry(value => value + 1); }}>重试加载题图</button>
    </div>;
  }

  const retryUrl = retry ? `${src}${src.includes('?') ? '&' : '?'}image_retry=${retry}` : src;
  return <img className={className} src={retryUrl} alt={alt} loading="lazy" onError={() => setFailedSource(src)} />;
}
