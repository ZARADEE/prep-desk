import { useEffect, useState } from 'react';
import { getRecentPracticeSessions } from '../api';
import type { RecentPracticeSession } from '../types';
import { ReviewTask, useReviewSummary } from '../components/ReviewTask';
import { openPractice } from './storage';

export function MobileHome(): JSX.Element {
  const [recent, setRecent] = useState<RecentPracticeSession | null>(null);
  const [error, setError] = useState('');
  const { summary, error: reviewError } = useReviewSummary();
  useEffect(() => { let live = true; void getRecentPracticeSessions().then(items => {
    if (live) setRecent(items.find(item => !item.completed_at) ?? null);
  }).catch(() => { if (live) setError('暂未连上电脑，请检查连接后重试。'); }); return () => { live = false; }; }, []);
  return <section className="mobile-home mobile-only" aria-label="接着学">
    <div className="mobile-home-heading"><strong>今天，从这里继续</strong><span>{new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span></div>
    <div className="mobile-resume"><div><strong>{recent ? recent.subject : '先完成一个小目标'}</strong><p>{recent ? `${recent.answered_count} / ${recent.total_count} 题已存电脑` : '沿用上次范围，来 5 题'}</p></div>
      <button className="primary-action" onClick={() => openPractice(recent ? { id: recent.id } : { quick: true })}>{recent ? '继续练习 →' : '开始 5 题 →'}</button></div>
    {error && <p role="status">{error}</p>}
    <ReviewTask summary={summary} error={reviewError} compact />
    {recent && <button className="outline-action" onClick={() => openPractice({ quick: true })}>另开 5 题</button>}
  </section>;
}
