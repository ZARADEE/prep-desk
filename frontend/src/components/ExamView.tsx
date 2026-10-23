import { ArrowLeft, ArrowRight, Check, Clock3, Flag, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { examPreviewUrl, getConfidenceSummary, getExam, saveExamAnswer, selfGradeExam, submitExam } from "../api";
import type { ConfidenceSummary, ExamAnswer, ExamSession } from "../types";
import { ConfidencePicker, ConfidenceSummaryView, CONFIDENCE_LABELS } from "./ConfidencePicker";
import { RichText } from "./RichText";

const emptyAnswer = (): ExamAnswer => ({ selected_options: [], text_answer: "", confidence_level: null, marked: false });
const typeName: Record<string, string> = { choice: "选择题", fill: "填空题", solution: "解答题", short_answer: "简答题" };

export function ExamView({ exam, onChange, onClose, onRestart }: {
  exam: ExamSession;
  onChange: (exam: ExamSession) => void;
  onClose: () => void;
  onRestart: () => void;
}): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, ExamAnswer>>(exam.answers);
  const answersRef = useRef(answers);
  const dirty = useRef(new Set<string>());
  const saveTimer = useRef<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const submitting = useRef(false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ConfidenceSummary | null>(null);
  const [selfScore, setSelfScore] = useState(0);
  const questions = exam.paper.questions;
  const question = questions[index];
  const answer = answers[question?.id] ?? emptyAnswer();
  const submitted = Boolean(exam.submitted_at);
  const remaining = Math.max(0, Math.ceil((Date.parse(exam.deadline_at) - now) / 1000));
  const answeredCount = questions.filter(q => {
    const value = answers[q.id];
    return value && (q.type === "choice" ? value.selected_options.length > 0 : Boolean(value.text_answer.trim()));
  }).length;

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { setAnswers(exam.answers); answersRef.current = exam.answers; }, [exam.id, exam.answers]);
  useEffect(() => {
    if (!submitted) return;
    void getConfidenceSummary().then(setSummary).catch(() => {});
  }, [submitted]);
  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [submitted]);
  useEffect(() => {
    if (!submitted && remaining === 0 && !submitting.current) void finish(true);
  }, [remaining, submitted]);
  useEffect(() => () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); void flush().catch(() => {}); }, [exam.id]);
  useEffect(() => { setSelfScore(answers[question?.id]?.self_score ?? 0); }, [question?.id, exam.answers]);

  function flush(): Promise<void> {
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const ids = [...dirty.current];
    dirty.current.clear();
    if (!ids.length) return queue.current;
    const snapshot = answersRef.current;
    setSaving(true);
    queue.current = queue.current.catch(() => {}).then(async () => {
      for (const id of ids) {
        try { await saveExamAnswer(exam.id, id, snapshot[id]); }
        catch (reason) { dirty.current.add(id); throw reason; }
      }
    }).finally(() => setSaving(false));
    return queue.current;
  }

  function update(patch: Partial<ExamAnswer>): void {
    if (submitted || !question) return;
    const next = { ...(answersRef.current[question.id] ?? emptyAnswer()), ...patch };
    const all = { ...answersRef.current, [question.id]: next };
    answersRef.current = all;
    setAnswers(all);
    dirty.current.add(question.id);
    setError("");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flush().catch(reason => setError(reason instanceof Error ? reason.message : "暂存失败")); }, 600);
  }

  async function finish(automatic = false): Promise<void> {
    if (submitting.current || submitted) return;
    if (!automatic && answeredCount < questions.length && !window.confirm(`还有 ${questions.length - answeredCount} 道题未作答，确定交卷吗？`)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await flush();
      onChange(await submitExam(exam.id));
    } catch (reason) {
      try {
        const latest = await getExam(exam.id);
        if (latest.submitted_at) onChange(latest);
        else setError(reason instanceof Error ? reason.message : "交卷失败，请重试。");
      } catch { setError(reason instanceof Error ? reason.message : "交卷失败，请重试。"); }
    } finally { setBusy(false); submitting.current = false; }
  }

  async function close(): Promise<void> {
    if (!submitted) {
      try { await flush(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "暂存失败，暂时无法离开。"); return; }
    }
    onClose();
  }

  async function grade(): Promise<void> {
    if (!question) return;
    setBusy(true); setError("");
    try { onChange(await selfGradeExam(exam.id, question.id, selfScore)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "自评保存失败。"); }
    finally { setBusy(false); }
  }

  if (!question) return <div className="notice notice-warning">这份试卷没有可作答的题目。</div>;
  const result = exam.results?.questions[question.id];
  const multiple = question.answer_mode === "multiple" || question.type === "choice" && /[A-D]{2,4}/.test(question.answer_markdown ?? "");
  return <div className="exam-workspace">
    <header className="exam-header">
      <button className="outline-action" type="button" onClick={() => void close()}><ArrowLeft size={16} />返回组卷</button>
      <div><span className="eyebrow">ONLINE PAPER / {exam.paper.id}</span><h1>{exam.paper.title}</h1></div>
      <div className="exam-clock"><Clock3 size={20} /><strong>{submitted ? "已交卷" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</strong><small>{submitted ? "可查看答案与自评" : "倒计时结束自动交卷"}</small></div>
    </header>
    {error && <div className="notice notice-danger" role="alert">{error}</div>}
    {submitted && exam.results && <section className="exam-results">
      <strong>当前得分 {exam.results.score} / {exam.results.graded_possible}</strong>
      <span>卷面总分 {exam.results.paper_possible} · {exam.results.pending_count ? `${exam.results.pending_count} 题待自评` : "评分已完成"}</span>
      {exam.results.high_confidence_wrong.length > 0 && <span>高把握答错 {exam.results.high_confidence_wrong.length} 题，建议优先复盘。</span>}
      <button type="button" className="outline-action" onClick={onRestart}><RotateCcw size={16} />重做本卷</button>
      <ConfidenceSummaryView summary={summary} />
    </section>}
    <div className="exam-layout">
      <aside className="exam-rail" aria-label="试卷题号">
        <strong>{answeredCount} / {questions.length} 已作答</strong>
        {exam.paper.sections.map(section => <div className="exam-rail-section" key={section.id}>
          <span>{section.title}</span><div>{questions.map((q, i) => q.section_id === section.id && <button type="button" key={q.id}
            className={`${i === index ? "is-active" : ""} ${answers[q.id] && (q.type === "choice" ? answers[q.id].selected_options.length : answers[q.id].text_answer.trim()) ? "is-answered" : ""}`}
            aria-label={`第 ${i + 1} 题${answers[q.id]?.marked ? "，已标记" : ""}`}
            onClick={() => { if (!submitted) void flush().catch(reason => setError(String(reason))); setIndex(i); }}>
            {i + 1}{answers[q.id]?.marked ? " *" : ""}</button>)}</div>
        </div>)}
      </aside>
      <section className="exam-question-panel">
        <div className="exam-question-top"><span className="question-index">{index + 1}</span><div><span className="eyebrow">{typeName[question.type] ?? question.type} · {question.allocated_score} 分</span><h2>{question.section_title ?? "试卷作答"}</h2></div>
          <button type="button" className="outline-action" disabled={submitted} onClick={() => update({ marked: !answer.marked })}><Flag size={16} />{answer.marked ? "取消标记" : "标记"}</button></div>
        {question.frozen_question_preview ? <img className="exam-question-image" src={examPreviewUrl(exam.id, question.id)} alt="原版题面" /> : <RichText text={question.stem_markdown} />}
        {question.type === "choice" ? <div className="exam-options">{question.options.map(option => {
          const selected = answer.selected_options.includes(option.key);
          const correct = result?.correct_options.includes(option.key);
          return <button type="button" key={option.key} disabled={submitted} className={`${selected ? "is-selected" : ""} ${submitted && correct ? "is-correct" : ""} ${submitted && selected && !correct ? "is-wrong" : ""}`}
            onClick={() => update({ selected_options: multiple ? (selected ? answer.selected_options.filter(key => key !== option.key) : [...answer.selected_options, option.key].sort()) : [option.key] })}>
            <b>{option.key}</b><span>{option.text}</span>{submitted && correct && <Check size={18} />}</button>;
        })}</div> : <textarea className="exam-text-answer" value={answer.text_answer} disabled={submitted} onChange={event => update({ text_answer: event.target.value })} placeholder="在此输入作答过程；草稿会自动保存" />}
        {!submitted && <ConfidencePicker value={answer.confidence_level} onChange={value => update({ confidence_level: value })} />}
        {submitted && <div className="exam-review">
          <strong>{result?.status === "correct" ? "回答正确" : result?.status === "incorrect" ? "回答错误" : result?.status === "self_graded" ? "已自评" : "待自评"}{result?.score !== null ? ` · ${result?.score} 分` : ""}</strong>
          {answer.confidence_level && <span>提交前把握度：{CONFIDENCE_LABELS[answer.confidence_level - 1]}</span>}
          <div><b>参考答案</b><RichText text={question.answer_markdown || "暂无文字参考答案，请查看原版解析。"} /></div>
          {question.analysis_markdown && <div><b>解析</b><RichText text={question.analysis_markdown} /></div>}
          {question.scoring_points?.length > 0 && <div><b>评分点</b><ul>{question.scoring_points.map((point, i) => <li key={i}>{point.label} · {point.score} 分</li>)}</ul></div>}
          {question.analysis_source_document_id && <img className="exam-question-image" src={examPreviewUrl(exam.id, question.id, "analysis")} alt="原版解析" />}
          {result?.status === "pending" || result?.status === "self_graded" ? <div className="exam-self-grade"><label>本题自评得分 <input type="number" min={0} max={question.allocated_score} step="0.5" value={selfScore} onChange={event => setSelfScore(Number(event.target.value))} /></label><button type="button" disabled={busy} onClick={() => void grade()}>保存自评</button></div> : null}
        </div>}
        <footer className="exam-question-footer"><button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} />上一题</button><span>{saving ? "保存中…" : "自动暂存"}</span>{index < questions.length - 1 ? <button type="button" onClick={() => setIndex(index + 1)}>下一题<ArrowRight size={16} /></button> : null}</footer>
      </section>
    </div>
    {!submitted && <div className="exam-submit-bar"><span>{questions.length - answeredCount} 道未作答</span><button type="button" className="primary-action" disabled={busy} onClick={() => void finish()}><Send size={17} />{busy ? "正在交卷…" : "交卷并查看结果"}</button></div>}
  </div>;
}
