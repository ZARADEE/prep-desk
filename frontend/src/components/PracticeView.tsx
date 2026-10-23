import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Square,
  Sparkles,
  Trash2,
  Target,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerPracticeQuestion,
  API_BASE,
  deleteWrongBookItem,
  exportPracticeMistakes,
  getPracticeCatalog,
  getConfidenceSummary,
  getRecentPracticeSessions,
  getPracticeSession,
  getWrongBook,
  practiceExportDownloadUrl,
  questionPreviewUrl,
  startPractice
} from "../api";
import type {
  Question,
  PracticeAnswerResult,
  PracticeCatalog,
  PracticeMajorTag,
  PracticeQuestion,
  RecentPracticeSession,
  PracticeSession,
  PracticeSubject,
  WrongBookItem
} from "../types";
import type { ConfidenceSummary } from "../types";
import { ConfidencePicker, ConfidenceSummaryView, CONFIDENCE_LABELS } from "./ConfidencePicker";

import { QuestionReflection, learningRequest } from "./LearningPanel";
import { ResponsiveSheet } from '../mobile/MobilePrimitives';
import { OPEN_PRACTICE, readLocal, writeLocal } from '../mobile/storage';
import { RichText } from './RichText';
import { QuestionImage } from './QuestionImage';
import type { KnowledgeCard } from "./LearningPanel";
import { QuestionExplanation } from "./QuestionExplanation";

const wrongBookVictoryLines = [
  "这波很能打，错题本已经开始认真反省了。",
  "今天的错题基本被你按在地上摩擦了一遍。",
  "手感在线，这一轮回炉回得又快又稳。",
  "错题本现在的表情，应该有点不服但又没办法。",
  "你刚才那一下，错题都该怀疑自己是不是来错地方了。",
  "这轮收得漂亮，错题已经被你整得有点安静。",
  "别停，今天这个状态很像开了加速器。",
  "错题这边刚露头，又被你顺手摁回去了。"
];

function firstSubject(catalog: PracticeCatalog): PracticeSubject | undefined {
  return catalog.subjects[0];
}

function firstMajor(subject?: PracticeSubject): PracticeMajorTag | undefined {
  return subject?.major_tags[0];
}

function pickWrongBookVictoryLine(): string {
  return wrongBookVictoryLines[Math.floor(Math.random() * wrongBookVictoryLines.length)];
}

export function PracticeView({active=true}:{active?:boolean}): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFilter, setSheetFilter] = useState('all');
  const [draftSaved, setDraftSaved] = useState(true);
  const [, setLearningRevision] = useState(0);
  const [marked, setMarked] = useState<string[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [catalog, setCatalog] = useState<PracticeCatalog | null>(null);
  const [subject, setSubject] = useState("");
  const [majorTag, setMajorTag] = useState("");
  const [subTag, setSubTag] = useState("");
  const [count, setCount] = useState(10);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentPracticeSession[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedConfidence, setSelectedConfidence] = useState<number | null>(null);
  const [confidenceSummary, setConfidenceSummary] = useState<ConfidenceSummary | null>(null);
  const [answerResult, setAnswerResult] = useState<PracticeAnswerResult | null>(null);
  const [wrongBook, setWrongBook] = useState<WrongBookItem[]>([]);
  const [showWrongBook, setShowWrongBook] = useState(false);
  const [wrongBookVictoryLine, setWrongBookVictoryLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [continuousLoading, setContinuousLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogReady, setCatalogReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<{ id?: string; quick?: boolean; questionIds?: string[] } | null>(null);
  const continuousModeRef = useRef(false);
  const continuousTimerRef = useRef<number | null>(null);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    return () => {
      if (continuousTimerRef.current !== null) {
        window.clearTimeout(continuousTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void getPracticeCatalog()
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        const saved = readLocal<{ subject?: string; major_tag?: string; sub_tag?: string }>('paper-helper.practice-filters', {});
        const nextSubject = nextCatalog.subjects.find(item => item.value === saved.subject) ?? firstSubject(nextCatalog);
        const nextMajor = nextSubject?.major_tags.find(item => item.value === saved.major_tag) ?? firstMajor(nextSubject);
        setSubject(nextSubject?.value ?? "");
        setMajorTag(nextMajor?.value ?? "");
        setSubTag(nextMajor?.sub_tags.some(item => item.value === saved.sub_tag) ? (saved.sub_tag ?? "") : nextMajor?.sub_tags[0]?.value ?? "");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "题库目录加载失败。"))
      .finally(() => setCatalogReady(true));
  }, []);
  useEffect(() => { void getConfidenceSummary().then(setConfidenceSummary).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => { void getRecentPracticeSessions().then(value => { if (live) setRecentSessions(value); }).catch(() => {}); };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  const selectedSubject = useMemo(
    () => catalog?.subjects.find((item) => item.value === subject),
    [catalog, subject]
  );
  const selectedMajor = useMemo(
    () => selectedSubject?.major_tags.find((item) => item.value === majorTag),
    [majorTag, selectedSubject]
  );
  useEffect(() => {
    const next = { subject, major_tag: majorTag, sub_tag: subTag };
    if (next.subject && !writeLocal('paper-helper.practice-filters', next)) setError('本机筛选偏好无法保存。');
  }, [subject, majorTag, subTag]);
  const currentQuestion: PracticeQuestion | undefined = session?.questions[currentIndex];
  const resultQuestion = answerResult?.question;
  const isWrongBookSession = session?.mode === "wrong_book";
  const totalAvailable = selectedMajor?.sub_tags.find((item) => item.value === subTag)?.count
    ?? selectedMajor?.count
    ?? selectedSubject?.count
    ?? 0;
  const isMultiple = currentQuestion?.answer_mode === "multiple";

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; quick?: boolean; questionIds?: string[] }>).detail || {};
      setPendingOpen(detail);
    };
    window.addEventListener(OPEN_PRACTICE, open);
    return () => window.removeEventListener(OPEN_PRACTICE, open);
  }, []);

  useEffect(() => {
    if (!pendingOpen || !draftReady || busy) return;
    if (pendingOpen.quick && !catalog && !catalogReady) return;
    const detail = pendingOpen;
    setPendingOpen(null);
    if (detail.id) {
      void resume(detail.id);
    } else if (detail.questionIds?.length) {
      void launchPracticeSession({ subject, major_tag: '', sub_tag: '', count: detail.questionIds.length, question_ids: detail.questionIds });
    } else if (detail.quick && catalog) {
      const saved = readLocal<{ subject?: string; major_tag?: string; sub_tag?: string }>('paper-helper.practice-filters', {});
      const chosenSubject = catalog.subjects.find(item => item.value === saved.subject) ?? firstSubject(catalog);
      const chosenMajor = chosenSubject?.major_tags.find(item => item.value === saved.major_tag) ?? firstMajor(chosenSubject);
      const chosenSub = chosenMajor?.sub_tags.find(item => item.value === saved.sub_tag);
      const available = chosenSub?.count ?? chosenMajor?.count ?? chosenSubject?.count ?? 0;
      if (chosenSubject && available) {
        stopContinuousPractice();
        void launchPracticeSession({ subject: chosenSubject.value, question_bank_id: chosenSubject.question_bank_id ?? undefined, major_tag: chosenMajor?.value ?? '', sub_tag: chosenSub?.value ?? '', count: Math.min(5, available), seed: Date.now() });
      } else setError('当前题库还没有可练习题目。');
    } else if (detail.quick) {
      setError('题库目录加载失败，暂时无法开始练习。');
    }
  }, [pendingOpen, draftReady, busy, catalog, catalogReady, subject]);

  useEffect(() => {
    if (!session || session.completed) return;
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.completed]);

  useEffect(() => {
    if (!draftReady || !session) return;
    try { localStorage.setItem("paper-helper-practice-draft", JSON.stringify({ id: session.id, currentIndex, marked, draftAnswers, elapsed })); setDraftSaved(true); }
    catch { setDraftSaved(false); setError("无法暂存草稿：本地存储空间不足或不可用。"); }
  }, [session?.id, currentIndex, marked, draftAnswers, elapsed, draftReady]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("paper-helper-practice-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (typeof draft.id === "string") {
          void resume(draft.id, draft).finally(() => setDraftReady(true));
          return;
        }
      }
    } catch { setError("暂存草稿无法读取，可从学习记录恢复练习。"); }
    setDraftReady(true);
  }, []);

  async function resume(id: string, draft?: { currentIndex?: number; marked?: string[]; draftAnswers?: Record<string, string[]>; elapsed?: number }): Promise<void> {
    stopContinuousPractice(); setBusy(true);
    try {
      const next = await getPracticeSession(id);
      setSession(next);
      const index = Math.max(0, Math.min(draft?.currentIndex ?? next.questions.findIndex(q => !q.attempt), next.questions.length - 1));
      setCurrentIndex(index); setMarked(draft?.marked ?? []); setDraftAnswers(draft?.draftAnswers ?? {}); setElapsed(draft?.elapsed ?? 0);
      restoreQuestion(next, index, draft?.draftAnswers ?? {});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复失败"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!session || session.completed) return;
    let live = true;
    let checking = false;
    const timer = window.setInterval(() => {
      if (checking) return;
      checking = true;
      void getPracticeSession(session.id).then(latest => {
        if (!live || latest.answered_count <= session.answered_count) return;
        setSession(current => current?.id === latest.id && latest.answered_count > current.answered_count ? latest : current);
        if (latest.questions[currentIndex]?.attempt) restoreQuestion(latest, currentIndex);
      }).catch(() => {}).finally(() => { checking = false; });
    }, 4000);
    return () => { live = false; window.clearInterval(timer); };
  }, [session?.id, session?.completed, session?.answered_count, currentIndex]);

  function restoreQuestion(active: PracticeSession, index: number, drafts = draftAnswers): void {
    const question = active.questions[index];
    const attempt = question?.attempt;
    setSelectedOptions(attempt?.selected_options ?? drafts[question?.id] ?? []);
    setSelectedConfidence(attempt?.confidence_level ?? null);
    setAnswerResult(attempt ? { question_id: question.id, selected_options: attempt.selected_options, correct_options: attempt.correct_options, correct: attempt.is_correct, confidence_level: attempt.confidence_level, question, answered_count: active.answered_count, total_count: active.total_count, wrong_question_ids: active.wrong_question_ids } : null);
  }

  function jump(index: number): void {
    if (!session || busy) return;
    setSheetOpen(false);
    setCurrentIndex(index); restoreQuestion(session, index);
  }

  async function practiceCard(card: KnowledgeCard, ids = card.question_ids): Promise<void> {
    stopContinuousPractice();
    await launchPracticeSession({ subject: card.subject, question_bank_id: card.question_bank_id, major_tag: "", sub_tag: "", question_ids: ids, count: Math.min(10, ids.length), seed: Date.now() });
  }

  async function practiceRelated(question: Question): Promise<void> {
    try {
      const data = await learningRequest<{ cards: KnowledgeCard[] }>("/overview");
      const card = data.cards.find(item => item.question_ids.includes(question.id));
      if (card) await practiceCard(card);
    } catch (reason) { setError(String(reason)); }
  }

  function changeSubject(value: string): void {
    const nextSubject = catalog?.subjects.find((item) => item.value === value);
    const nextMajor = firstMajor(nextSubject);
    setSubject(value);
    setMajorTag(nextMajor?.value ?? "");
    setSubTag(nextMajor?.sub_tags[0]?.value ?? "");
  }

  function changeMajor(value: string): void {
    const nextMajor = selectedSubject?.major_tags.find((item) => item.value === value);
    setMajorTag(value);
    setSubTag(nextMajor?.sub_tags[0]?.value ?? "");
  }

  async function launchPracticeSession(
    payload: Parameters<typeof startPractice>[0],
    quiet = false
  ): Promise<boolean> {
    setWrongBookVictoryLine("");
    setBusy(true);
    if (!quiet) setError("");
    try {
      const nextSession = await startPractice(payload);
      setMarked([]); setDraftAnswers({}); setElapsed(0);
      setLearningRevision(value => value + 1);
      setSession(nextSession);
      setCurrentIndex(0);
      setSelectedOptions([]);
      setSelectedConfidence(null);
      setAnswerResult(null);
      return true;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "无法开始刷题。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function beginPractice(requestedCount = count, quiet = false): Promise<boolean> {
    if (!subject) return false;
    writeLocal('paper-helper.practice-filters', { subject, major_tag: majorTag, sub_tag: subTag });
    return launchPracticeSession({
      subject,
      question_bank_id: selectedSubject?.question_bank_id ?? undefined,
      major_tag: majorTag,
      sub_tag: subTag,
      count: Math.max(1, Math.min(requestedCount, Math.max(1, totalAvailable))),
      seed: Date.now()
    }, quiet);
  }

  async function beginWrongBookPractice(): Promise<void> {
    if (busy || !(catalog?.wrong_book_count ?? 0)) return;
    continuousModeRef.current = false;
    setContinuousMode(false);
    setContinuousLoading(false);
    await launchPracticeSession({
      subject: "错题本",
      major_tag: "",
      sub_tag: "",
      count: 1,
      seed: Date.now(),
      mode: "wrong_book"
    });
  }

  async function beginContinuousPractice(): Promise<void> {
    if (busy || !totalAvailable) return;
    continuousModeRef.current = true;
    setContinuousMode(true);
    const started = await beginPractice(1, true);
    if (!started) {
      continuousModeRef.current = false;
      setContinuousMode(false);
    }
  }

  function stopContinuousPractice(): void {
    continuousModeRef.current = false;
    setContinuousMode(false);
    setContinuousLoading(false);
    if (continuousTimerRef.current !== null) {
      window.clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
  }

  function toggleOption(key: string): void {
    if (answerResult || !currentQuestion) return;
    const next = isMultiple ? (selectedOptions.includes(key) ? selectedOptions.filter(item => item !== key) : [...selectedOptions, key].sort()) : [key];
    setSelectedOptions(next);
    setDraftAnswers(current => ({ ...current, [currentQuestion.id]: next }));
  }

  async function submitAnswer(): Promise<void> {
    if (!session || !currentQuestion || !selectedOptions.length || answerResult) return;
    setBusy(true);
    setError("");
    try {
      const result = await answerPracticeQuestion(session.id, currentQuestion.id, selectedOptions, selectedConfidence);
      const completed = result.answered_count >= result.total_count;
      setLearningRevision(value => value + 1);
      void getPracticeCatalog().then(setCatalog).catch(() => {});
      setAnswerResult(result);
      setSession((current) => current ? {
        ...current,
        questions: current.questions.map(q => q.id === result.question_id ? { ...result.question, answer_mode: q.answer_mode, attempt: { question_id: q.id, selected_options: result.selected_options, correct_options: result.correct_options, is_correct: result.correct, confidence_level: result.confidence_level, created_at: new Date().toISOString() } } : q),
        answered_count: result.answered_count,
        wrong_question_ids: result.wrong_question_ids,
        completed
      } : current);
      void getConfidenceSummary().then(setConfidenceSummary).catch(() => {});
      if (completed && session.mode === "wrong_book") {
        setWrongBookVictoryLine(pickWrongBookVictoryLine());
      }
      if (continuousModeRef.current) {
        setContinuousLoading(true);
        continuousTimerRef.current = window.setTimeout(() => {
          continuousTimerRef.current = null;
          if (!continuousModeRef.current) {
            setContinuousLoading(false);
            return;
          }
          void beginPractice(1, true).then((started) => {
            if (!started) {
              continuousModeRef.current = false;
              setContinuousMode(false);
            }
          }).finally(() => setContinuousLoading(false));
        }, 900);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "提交答案失败。");
    } finally {
      setBusy(false);
    }
  }

  function nextQuestion(): void {
    if (!session || currentIndex >= session.questions.length - 1) return;
    jump(currentIndex + 1);
  }

  async function toggleWrongBook(): Promise<void> {
    if (!showWrongBook) {
      try {
        const result = await getWrongBook(subject ? { subject } : {});
        setWrongBook(result.items);
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "错题本加载失败。");
      }
    }
    setShowWrongBook((value) => !value);
  }

  async function exportMistakes(): Promise<void> {
    if (!session || !session.wrong_question_ids.length) return;
    setBusy(true);
    setError("");
    try {
      const job = await exportPracticeMistakes(session.id);
      window.open(practiceExportDownloadUrl(job.id), "_blank", "noopener,noreferrer");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "错题 PDF 导出失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeWrongBookItem(questionId: string): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await deleteWrongBookItem(questionId);
      setWrongBook((current) => current.filter((item) => item.id !== questionId));
      setCatalog((current) => current ? {
        ...current,
        wrong_book_count: Math.max(0, current.wrong_book_count - 1)
      } : current);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "删除错题失败。");
    } finally {
      setBusy(false);
    }
  }

  function resetSession(): void {
    stopContinuousPractice();
    try { localStorage.removeItem("paper-helper-practice-draft"); } catch { /* History remains in SQLite. */ }
    setSession(null);
    setCurrentIndex(0);
    setSelectedOptions([]);
    setSelectedConfidence(null);
    setAnswerResult(null);
    setWrongBookVictoryLine("");
  }

  function stopPractice(): void {
    stopContinuousPractice();
    resetSession();
  }

  return (
    <div className="practice-layout">
      <section className="practice-main">
        <div className="practice-header panel panel-blue">
          <div>
            <div className="eyebrow">RAPID DRILL / MULTIPLE CHOICE</div>
            <h1>小题狂练</h1>
            <p>按科目和复式 tag 随机抽题，提交后即时判题；错题会持续保存在错题本中。</p>
          </div>
          <div className="practice-header-mark">
            <ListChecks size={42} strokeWidth={3} />
            <strong>{catalog?.wrong_book_count ?? 0}</strong>
            <span>HISTORY<br />WRONG</span>
          </div>
        </div>

        {error && (
          <div className="notice notice-danger practice-notice">
            <X size={18} />
            <div><strong>操作未完成</strong><span>{error}</span></div>
          </div>
        )}

        {!session ? (
          <section className="practice-setup panel">
            <div className="practice-section-head">
              <div>
                <div className="section-kicker">01 / SET FILTER</div>
                <h2>设置本次刷题</h2>
              </div>
              <span className="practice-count-mark">{totalAvailable} 道可用</span>
            </div>
            {recentSessions.length > 0 && <section className="recent-practice" aria-label="最近练习记录">
              <div><b>最近练习 / 跨设备继续</b><small>作答记录保存在同一份本地数据库</small></div>
              <div className="recent-practice-list">{recentSessions.slice(0, 5).map(item => <button key={item.id} type="button" onClick={() => void resume(item.id)} disabled={busy}>
                <strong>{item.subject}</strong><span>{item.answered_count}/{item.total_count} 已答 · {item.correct_count} 正确</span><small>{new Date(item.created_at).toLocaleString()}</small><b>{item.completed_at ? "查看记录" : "继续练习"} →</b>
              </button>)}</div>
            </section>}
            <div className="practice-fields">
              <label>
                <span>学科</span>
                <select value={subject} onChange={(event) => changeSubject(event.target.value)}>
                  {catalog?.subjects.map((item) => (
                    <option key={item.value} value={item.value}>{item.label} / {item.count}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>大类 tag</span>
                <select value={majorTag} onChange={(event) => changeMajor(event.target.value)}>
                  {selectedSubject?.major_tags.map((item) => (
                    <option key={item.value} value={item.value}>{item.label} / {item.count}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>小类 tag</span>
                <select value={subTag} onChange={(event) => setSubTag(event.target.value)}>
                  <option value="">全部小类</option>
                  {selectedMajor?.sub_tags.map((item) => (
                    <option key={item.value} value={item.value}>{item.label} / {item.count}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>题量</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Math.min(100, totalAvailable))}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value) || 1)}
                />
              </label>
            </div>
            <div className="practice-setup-footer">
              <div className="practice-rules">
                <span><Check size={15} /> 选择题自动判分</span>
                <span><BookOpen size={15} /> 错题本持续累积</span>
              </div>
              <div className="practice-start-actions">
                <button
                  className="continuous-action"
                  type="button"
                  onClick={() => void beginContinuousPractice()}
                  disabled={busy || !catalog || !totalAvailable}
                >
                  <RefreshCw size={18} /> 一直刷题！
                </button>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void beginPractice()}
                  disabled={busy || !catalog || !totalAvailable}
                >
                  <ListChecks size={18} /> 开始随机刷题 <ArrowRight size={18} />
                </button>
              </div>
            </div>
            <ConfidenceSummaryView summary={confidenceSummary} />
          </section>
        ) : (
          <section className="practice-stage panel">
            <div className="practice-stage-head">
              <div>
                <div className="section-kicker">02 / ACTIVE SESSION</div>
                <h2>{isWrongBookSession ? "错题本" : session.subject}</h2>
                <div className="question-meta">
                  {isWrongBookSession ? (
                    <>
                      <span>全量抽取</span>
                      <span>随机顺序</span>
                    </>
                  ) : (
                    <>
                      <span>{session.major_tag || "全部大类"}</span>
                      <span>{session.sub_tag || "全部小类"}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="practice-stage-actions">
                {continuousMode && <span className="continuous-status">连续刷题中</span>}
                <button type="button" className="outline-action" onClick={resetSession}>
                  <RotateCcw size={16} /> 新开一组
                </button>
                <button type="button" className="outline-action" onClick={() => void toggleWrongBook()}>
                  <BookOpen size={16} /> 错题本
                </button>
                <button
                  type="button"
                  className="outline-action"
                  onClick={() => void beginWrongBookPractice()}
                  disabled={busy || !(catalog?.wrong_book_count ?? 0)}
                >
                  <Target size={16} /> 只练错题
                </button>
                <button type="button" className="stop-action" onClick={stopPractice}>
                  <Square size={15} /> 停止刷题
                </button>
              </div>
            </div>
            <div className="practice-progress">
              <span>QUESTION {String(currentIndex + 1).padStart(2, "0")} / {String(session.total_count).padStart(2, "0")}</span>
              <strong>{session.answered_count} / {session.total_count} 已提交</strong>
              <div className="practice-progress-track">
                <i style={{ width: `${(session.answered_count / Math.max(1, session.total_count)) * 100}%` }} />
              </div>
            </div>
            {isWrongBookSession && wrongBookVictoryLine && session.completed && (
              <div className="notice notice-info practice-finish-notice">
                <Sparkles size={18} />
                <div>
                  <strong>只练错题收工</strong>
                  <span>{wrongBookVictoryLine}</span>
                </div>
              </div>
            )}
            <ResponsiveSheet open={sheetOpen && active} title="答题卡" onClose={() => setSheetOpen(false)}><div className="answer-card">
              <div className="toolbar-actions"><button type="button" onClick={() => window.open(`${API_BASE}/practice/sessions/${session.id}/pdf?variant=question`, "_blank", "noopener,noreferrer")}>导出练习 PDF</button><button type="button" disabled={!session.completed} onClick={() => window.open(`${API_BASE}/practice/sessions/${session.id}/pdf?variant=answer`, "_blank", "noopener,noreferrer")}>导出答案解析 PDF</button></div>
              <strong>用时 {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · {draftSaved ? '草稿已存本机' : '本机保存失败'}</strong>
              <div className="mobile-sheet-filters">{[['all','全部'],['unanswered','未答'],['marked','标记']].map(([key,label]) => <button key={key} aria-pressed={sheetFilter === key} onClick={() => setSheetFilter(key)}>{label}</button>)}</div>
              <div>{session.questions.map((q, index) => (sheetFilter === 'all' || sheetFilter === 'unanswered' && !q.attempt || sheetFilter === 'marked' && marked.includes(q.id)) && <button aria-label={`第 ${index + 1} 题${q.attempt ? '，已答' : '，未答'}${marked.includes(q.id) ? '，已标记' : ''}${index === currentIndex ? '，当前位置' : ''}`} type="button" disabled={busy} key={q.id} className={index === currentIndex ? "is-active" : ""} onClick={() => jump(index)}>{index + 1}{q.attempt ? " ✓" : " ○"}{marked.includes(q.id) ? " ★" : ""}</button>)}</div>
              {currentQuestion && <button type="button" onClick={() => setMarked(items => items.includes(currentQuestion.id) ? items.filter(id => id !== currentQuestion.id) : [...items, currentQuestion.id])}>{marked.includes(currentQuestion.id) ? "取消标记" : "标记此题"}</button>}
            </div></ResponsiveSheet>
            {currentQuestion && (
              <div className="practice-question">
                <div className="practice-question-head">
                  <span className="question-index">{currentIndex + 1}</span>
                  <div>
                    <span className="practice-mode">{isMultiple ? "多项选择题 / SELECT ALL" : "单项选择题 / SELECT ONE"}</span>
                    {currentQuestion.source_document_id && (currentQuestion.source_regions?.length || currentQuestion.source_page) ? (
                      <QuestionImage
                        className="practice-question-image"
                        alt="原版题面"
                        src={questionPreviewUrl(currentQuestion.id)}
                        fallback={<RichText text={currentQuestion.stem_markdown} />}
                      />
                    ) : (
                      <RichText text={currentQuestion.stem_markdown} />
                    )}
                  </div>
                </div>
                <div className="practice-option-grid">
                  {currentQuestion.options.map((option) => {
                    const isSelected = selectedOptions.includes(option.key);
                    const isCorrect = answerResult?.correct_options.includes(option.key);
                    const isWrongChoice = answerResult && isSelected && !isCorrect;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`practice-option ${isSelected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrongChoice ? "is-wrong" : ""}`}
                        onClick={() => toggleOption(option.key)}
                        disabled={Boolean(answerResult) || busy}
                      >
                        <b>{option.key}</b>
                        <RichText text={option.text || `选择 ${option.key}`} />
                        {answerResult && isCorrect && <Check size={19} />}
                        {answerResult && isWrongChoice && <X size={19} />}
                      </button>
                    );
                  })}
                </div>
                {!answerResult ? (
                  <><ConfidencePicker value={selectedConfidence} onChange={setSelectedConfidence} /><div className="practice-submit-row">
                    <span>{isMultiple ? "请选择全部正确选项" : "请选择一个选项"}</span>
                    <button className="primary-action compact" type="button" onClick={() => void submitAnswer()} disabled={!selectedOptions.length || busy}>
                      <Check size={16} /> 提交答案
                    </button>
                  </div></>
                ) : (
                  <div className={`practice-result ${answerResult.correct ? "is-correct" : "is-wrong"}`}>
                    <div className="practice-result-title">
                      {answerResult.correct ? <Check size={23} /> : <X size={23} />}
                      <strong>{answerResult.correct ? "回答正确" : "回答错误"}</strong>
                      <span>你的答案：{answerResult.selected_options.join("、")}　正确答案：{answerResult.correct_options.join("、")}</span>
                      {answerResult.confidence_level && <span>提交前：{CONFIDENCE_LABELS[answerResult.confidence_level - 1]}{!answerResult.correct && answerResult.confidence_level === 4 ? " · 高把握答错" : ""}</span>}
                    </div>
                    {resultQuestion && <QuestionExplanation key={resultQuestion.id} question={resultQuestion} selected={answerResult.selected_options} active={active}/>}
                    {resultQuestion && <QuestionReflection key={resultQuestion.id} question={resultQuestion} onChanged={() => setLearningRevision(value => value + 1)} onPractice={q => void practiceRelated(q)} />}
                    <div className="practice-submit-row">
                      <span>
                        {continuousMode
                          ? (continuousLoading ? "正在准备下一道随机题..." : "连续刷题中")
                          : (currentIndex === session.questions.length - 1 ? "本组题目已到末尾" : "继续下一题")}
                      </span>
                      {!continuousMode && currentIndex < session.questions.length - 1 && (
                        <button className="primary-action compact" type="button" onClick={nextQuestion}>
                          下一题 <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {active && session && currentQuestion && <nav className="mobile-answer-dock mobile-only" aria-label="答题操作">
          <button type="button" onClick={() => setSheetOpen(true)}>答题卡<br /><small>{currentIndex + 1}/{session.total_count}</small></button>
          <button type="button" disabled={busy || currentIndex === 0} onClick={() => jump(currentIndex - 1)}>上一题</button>
          {!answerResult ? <button className="primary-action" disabled={busy || !selectedOptions.length} onClick={() => void submitAnswer()}>提交答案</button> : <button className="primary-action" disabled={busy} onClick={() => currentIndex < session.questions.length - 1 ? nextQuestion() : setSheetOpen(true)}>{currentIndex < session.questions.length - 1 ? '下一题' : session.completed ? '查看答题卡' : '还有未答题'}</button>}
          {!answerResult && <button disabled={busy || currentIndex === session.questions.length - 1} onClick={nextQuestion}>跳过</button>}
        </nav>}
        {session && session.wrong_question_ids.length > 0 && (
          <div className="practice-export-bar panel">
            <div>
              <div className="section-kicker">SESSION OUTPUT</div>
              <strong>本次已记录 {session.wrong_question_ids.length} 道错题</strong>
            </div>
            <button type="button" className="primary-action compact" onClick={() => void exportMistakes()} disabled={busy}>
              <Download size={17} /> 导出错题与答案 PDF
            </button>
          </div>
        )}
      </section>

      <aside className="practice-side">
        <section className="practice-side-panel panel panel-yellow">
          <div className="section-kicker">WRONG BOOK / PERSISTENT</div>
          <div className="practice-side-number">{catalog?.wrong_book_count ?? 0}</div>
          <strong>累计错题</strong>
          <p>错题不会随着新一轮刷题被清除，可在这里集中回看。</p>
          <div className="practice-side-actions">
            <button type="button" className="outline-action" onClick={() => void toggleWrongBook()}>
              <BookOpen size={16} /> {showWrongBook ? "收起错题本" : "查看错题本"}
            </button>
            <button
              type="button"
              className="outline-action"
              onClick={() => void beginWrongBookPractice()}
              disabled={busy || !(catalog?.wrong_book_count ?? 0)}
            >
              <Target size={16} /> 只练错题
            </button>
          </div>
        </section>
        <section className="practice-side-panel panel">
          <div className="section-kicker">CURRENT FILTER</div>
          <div className="practice-filter-line"><span>学科</span><strong>{subject || "未选择"}</strong></div>
          <div className="practice-filter-line"><span>大类</span><strong>{majorTag || "全部"}</strong></div>
          <div className="practice-filter-line"><span>小类</span><strong>{subTag || "全部"}</strong></div>
        </section>
      </aside>

      {showWrongBook && (
        <section className="wrong-book panel">
          <div className="wrong-book-head">
            <div>
              <div className="section-kicker">HISTORY / REVIEW</div>
              <h2>错题本</h2>
            </div>
            <span>{wrongBook.length} 道</span>
          </div>
          {wrongBook.length ? (
            <div className="wrong-book-list">
              {wrongBook.map((item) => (
                <article className="wrong-book-item" key={item.id}>
                  <div className="wrong-book-item-head">
                    <span>{item.subject}</span>
                    <div className="wrong-book-item-actions">
                      <b>错 {item.wrong_count} 次</b>
                      <button
                        type="button"
                        className="wrong-book-delete"
                        title="从错题本删除"
                        aria-label="从错题本删除"
                        onClick={() => void removeWrongBookItem(item.id)}
                        disabled={busy}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {item.source_document_id && (item.source_regions?.length || item.source_page) ? (
                    <QuestionImage
                      className="wrong-book-question-image"
                      alt="原版题面"
                      src={questionPreviewUrl(item.id)}
                      fallback={<div className="question-text">{item.stem_markdown}</div>}
                    />
                  ) : (
                    <div className="question-text">{item.stem_markdown}</div>
                  )}
                  <QuestionExplanation question={item} selected={item.last_selected_option} active={active}/>
                  <div className="question-meta">
                    {(item.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
                    <span>你的答案 {item.last_selected_option.join("、")}</span>
                    <span>正确 {item.last_correct_option.join("、")}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel"><strong>还没有错题</strong><span>完成一组刷题后，答错的题目会自动出现在这里。</span></div>
          )}
        </section>
      )}
    </div>
  );
}
