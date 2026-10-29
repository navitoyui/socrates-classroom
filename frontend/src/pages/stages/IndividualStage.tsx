import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, ChevronDown, Send } from "lucide-react";
import { api, type Activity, type ArgumentSummary, type Coverage } from "@/api";
import { keys, useConclusions, useConfirmPosition, useDialogue, useMembers, useNoteActions, useNotes, usePositions, useProgress, useSetCompleted, useStar } from "@/api/queries";
import { StarMap } from "@/components/star/StarMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClassResults, ConclusionView, MyConclusion, TeacherSynthesisPanel } from "./Conclusions";
import { NotesPanel } from "./NotesPanel";
import { MemberChip, ModeTabs, Panel, Section, StageLayout } from "./shared";

const COV: [keyof Coverage, string][] = [["claim", "主張"], ["reason", "理由"], ["evidence", "證據或例子"], ["counter", "反例的回應"]];
const SUMMARY_LABEL: Record<keyof ArgumentSummary, string> = { claim: "我的主張", reason: "我的理由", evidence: "證據或例子" };
const SUMMARY_KEYS = Object.keys(SUMMARY_LABEL) as (keyof ArgumentSummary)[];
const SURVEY_NAME = { debate: "個人調查", individual: "個人思辨" } as const;
const STATUS_NAME = { done: "已完成", confirmed: "已確認", talking: "對話中", todo: "未開始" } as const;
const STATUS_TONE = { done: "olive", confirmed: "olive", talking: "bronze", todo: "neutral" } as const;

function CoverageChips({ coverage }: { coverage?: Coverage }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COV.map(([k, n]) => <span key={k} className={cn("rounded-full border px-3 py-1 text-[11.5px]", coverage?.[k] ? "border-olive-soft bg-olive-soft text-olive" : "border-line text-ink-faint")}>{coverage?.[k] ? "✓ " : ""}{n}</span>)}
    </div>
  );
}

function ChatPanel({ a, readOnly }: { a: Activity; readOnly: boolean }) {
  const qc = useQueryClient();
  const { data: messages = [] } = useDialogue(a.id);
  const { data: notes = [] } = useNotes(a.id);
  const { create, remove } = useNoteActions(a.id);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, pending, mine]);

  async function send() {
    const t = text.trim();
    if (!t || pending !== null) return;
    setText(""); setMine(t); setPending(""); setError("");
    try {
      await api.sendDialogue(a.id, t, (c) => setPending((p) => (p ?? "") + c));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null); setMine(null);
      qc.invalidateQueries({ queryKey: keys.dialogue(a.id) });
      qc.invalidateQueries({ queryKey: keys.progress(a.id) });
    }
  }

  const toggleMark = (id: string, body: string) => {
    const note = notes.find((n) => n.sourceMessageId === id);
    if (note) remove.mutate(note.id);
    else create.mutate({ kind: "highlight", sourceMessageId: id, text: body });
  };
  const bubble = (role: "user" | "assistant", body: string, key: string, savedId?: string) => {
    const marked = !!savedId && notes.some((n) => n.sourceMessageId === savedId);
    return (
      <div key={key} className={cn("group flex items-start gap-3", role === "user" && "flex-row-reverse")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-2 font-serif text-sm text-bronze">{role === "user" ? "我" : "Σ"}</span>
        <p className={cn("max-w-[80%] rounded-2xl border px-4 py-2.5 font-serif text-[14.5px] leading-7", role === "user" ? "bg-bronze-soft" : "bg-bg-2", marked ? "border-bronze-dim" : "border-line")}>{body}</p>
        {savedId && !readOnly && (
          <button type="button" onClick={() => toggleMark(savedId, body)} aria-label={marked ? "取消標註" : "標註成筆記"} title={marked ? "取消標註" : "標註成筆記"}
            className={cn("mt-2 cursor-pointer text-ink-faint transition-opacity hover:text-bronze", marked ? "text-bronze" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}>
            {marked ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          </button>
        )}
      </div>
    );
  };
  return (
    <Panel>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {bubble("assistant", `${a.kind === "individual" ? "這次要思考的是" : "這場辯論的主題是"}「${a.statement}」。先不用急著下結論——你現在怎麼想？`, "opener")}
        {messages.map((m) => bubble(m.role, m.text, m.id, m.id))}
        {mine && bubble("user", mine, "mine")}
        {pending !== null && bubble("assistant", pending || "…", "pending")}
        {error && <p className="text-[12.5px] text-wine">{error}</p>}
        <div ref={end} />
      </div>
      {!readOnly && (
        <div className="flex items-end gap-2 border-t border-line p-3">
          <Textarea rows={1} value={text} placeholder="輸入你的想法…" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <Button size="icon" onClick={() => void send()} disabled={pending !== null} aria-label="送出"><Send className="size-4" /></Button>
        </div>
      )}
    </Panel>
  );
}

/** 還沒確認過時，先帶入 AI 依對話整理的草稿 */
function SummaryEditor({ a, initial, onDone }: { a: Activity; initial?: ArgumentSummary; onDone: () => void }) {
  const confirm = useConfirmPosition(a.id);
  const { data: draft } = useQuery({ queryKey: ["draft", a.id], queryFn: () => api.draftPosition(a.id), enabled: !initial, staleTime: 0 });
  const [form, setForm] = useState<ArgumentSummary | null>(null);
  const cur = form ?? initial ?? draft?.summary ?? null;
  if (!cur) return <p className="text-sm text-ink-faint">AI 整理中…</p>;
  return (
    <div className="space-y-3">
      {!initial && <p className="text-[12px] leading-relaxed text-ink-faint">AI 整理的草稿，改好再確認。</p>}
      {SUMMARY_KEYS.map((k) => (
        <label key={k} className="block"><span className="mb-1 block text-xs text-ink-dim">{SUMMARY_LABEL[k]}</span>
          <Textarea rows={2} value={cur[k]} onChange={(e) => setForm({ ...cur, [k]: e.target.value })} /></label>
      ))}
      {confirm.error && <p className="text-[12.5px] text-wine">{confirm.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>取消</Button>
        <Button size="sm" disabled={confirm.isPending || !cur.claim.trim()} onClick={() => confirm.mutate(cur, { onSuccess: onDone })}>確認</Button>
      </div>
    </div>
  );
}

function Investigation({ a, over }: { a: Activity; over: boolean }) {
  const { data: progress } = useProgress(a.id);
  const { data: positions = [] } = usePositions(a.id);
  const complete = useSetCompleted(a.id);
  const [editing, setEditing] = useState(false);
  const mine = positions.find((p) => p.confirmed);
  const status = mine ? "已確認" : progress?.rounds ? "對話中" : "尚未開始";

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex items-center gap-2"><Badge tone={mine ? "olive" : progress?.rounds ? "bronze" : "neutral"}>{status}</Badge><span className="text-[12px] text-ink-faint">已對話 {progress?.rounds ?? 0} / {progress?.maxRounds ?? 20} 輪</span></div>
      {editing ? <SummaryEditor a={a} initial={mine?.summary} onDone={() => setEditing(false)} /> : mine ? (
        <div className="space-y-3">
          {SUMMARY_KEYS.map((k) => <div key={k}><small className="text-[11px] text-ink-faint">{SUMMARY_LABEL[k]}</small><p className="font-serif text-sm leading-relaxed">{mine.summary[k] || "—"}</p></div>)}
          {!over && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>修改論點</Button>
              {a.kind === "individual" && <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate(true)}>完成，查看結算 →</Button>}
            </div>
          )}
          {complete.error && <p className="text-[12.5px] text-wine">{complete.error.message}</p>}
        </div>
      ) : (
        <>
          <CoverageChips coverage={progress?.coverage} />
          {!over && (progress?.readyToSummarize
            ? <><p className="text-[12px] text-olive">可以整理想法了。</p><Button size="sm" onClick={() => setEditing(true)}>整理我的想法</Button></>
            : <p className="text-[12px] text-ink-faint">至少聊 2 輪才能整理。</p>)}
        </>
      )}
    </div>
  );
}

function IndividualResult({ a }: { a: Activity }) {
  const { data: progress } = useProgress(a.id);
  const { data: positions = [] } = usePositions(a.id);
  const reopen = useSetCompleted(a.id);
  const hasStar = a.axes.length > 0;
  const { data: star } = useStar(a.id, "done", hasStar);
  const [tab, setTab] = useState<"star" | "mine" | "class" | "notes" | "chat">(hasStar ? "star" : "mine");
  const mine = positions.find((p) => p.confirmed);
  const tabs: ["star" | "mine" | "class" | "notes" | "chat", string][] = [...(hasStar ? [["star", "立場星圖"] as ["star", string]] : []), ["mine", "我的結論"], ["class", "全班結果"], ["notes", "我的筆記"], ["chat", "對話紀錄"]];

  const left = (
    <>
      <Section>
        <CardTitle>你的結果</CardTitle>
        <div className="mb-3 flex items-baseline gap-2"><b className="font-serif text-4xl font-medium text-bronze">{progress?.rounds ?? 0}</b><span className="text-xs text-ink-faint">輪對話</span><Badge tone="olive" className="ml-auto">已完成</Badge></div>
        <CoverageChips coverage={progress?.coverage} />
      </Section>
      {mine && <Section className="space-y-3">{SUMMARY_KEYS.map((k) => <div key={k}><small className="text-[11px] text-ink-faint">{SUMMARY_LABEL[k]}</small><p className="font-serif text-sm leading-relaxed">{mine.summary[k] || "—"}</p></div>)}</Section>}
      <Section>
        <Button variant="outline" size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate(false)}>回去繼續思辨</Button>
        {reopen.error && <p className="mt-1.5 text-[12.5px] text-wine">{reopen.error.message}</p>}
      </Section>
    </>
  );

  const body = {
    star: <Section>{star ? <StarMap data={star} /> : <p className="text-sm text-ink-faint">載入中…</p>}</Section>,
    mine: <Section><MyConclusion a={a} /></Section>,
    class: <ClassResults a={a} />,
    notes: <NotesPanel a={a} readOnly />,
  };
  const right = tab === "chat" ? <ChatPanel a={a} readOnly /> : <div className="min-h-0 flex-1 overflow-y-auto">{body[tab]}</div>;
  return (
    <StageLayout leftLabel="你的結果" left={left}
      rightLabel={tabs.find(([k]) => k === tab)?.[1] ?? "結算"} rightHeader={<div className="no-scrollbar overflow-x-auto"><ModeTabs items={tabs} value={tab} onChange={setTab} /></div>} right={right} />
  );
}

export function IndividualStage({ a, teacher, view }: { a: Activity; teacher: boolean; view: "current" | "past" }) {
  const [mode, setMode] = useState<"survey" | "notes">("survey");
  const { data: members = [] } = useMembers(a.id, !teacher);
  const over = view === "past";
  if (teacher) return <TeacherIndividual a={a} />;
  if (a.kind === "individual" && members.find((m) => m.isMe)?.individual?.status === "done") return <IndividualResult a={a} />;
  return (
    <StageLayout
      leftLabel={mode === "survey" ? SURVEY_NAME[a.kind] : "我的筆記"}
      leftHeader={<ModeTabs items={[["survey", SURVEY_NAME[a.kind]], ["notes", "我的筆記"]]} value={mode} onChange={setMode} />}
      left={mode === "survey" ? <Investigation a={a} over={over} /> : <NotesPanel a={a} readOnly={over} />}
      rightLabel="與蘇格拉底對話" right={<ChatPanel a={a} readOnly={over} />} />
  );
}

function TeacherIndividual({ a }: { a: Activity }) {
  const { data: members = [] } = useMembers(a.id);
  const { data: conclusions = [] } = useConclusions(a.id, a.kind === "individual");
  const [tab, setTab] = useState<"members" | "synthesis">("members");
  const [open, setOpen] = useState<string | null>(null);
  const { data: star } = useStar(a.id, "individual", a.axes.length > 0);
  const solo = a.kind === "individual";
  const finished = members.filter((m) => m.individual?.status === (solo ? "done" : "confirmed")).length;

  const left = (
    <>
      <Section>
        <div className="grid grid-cols-[4em_1fr_auto] items-center gap-3 text-[13px]"><span>{solo ? "已完成" : "已確認"}</span><span className="h-2 overflow-hidden rounded bg-bg-3"><i className="block h-full bg-bronze" style={{ width: `${members.length ? (finished / members.length) * 100 : 0}%` }} /></span><em className="not-italic text-ink-faint">{finished} / {members.length}</em></div>
      </Section>
      {a.axes.length > 0 && <Section>
        <CardTitle className="flex items-center justify-between">立場星圖</CardTitle>
        {star && star.agents.length ? <StarMap data={star} compact /> : <p className="text-[12.5px] text-ink-faint">還沒有人確認論點。</p>}
      </Section>}
    </>
  );
  const memberList = (
    <div className="min-h-0 flex-1 overflow-y-auto px-5">
      {members.map((m) => {
        const st = m.individual?.status ?? "todo";
        const c = conclusions.find((x) => x.memberId === m.id);
        const expanded = open === m.id && !!c;
        return (
          <div key={m.id} className="border-b border-line">
            <div className="grid grid-cols-[1.3fr_auto_3.5em_1.6fr_1.5rem] items-center gap-3 py-3 text-[13px] max-md:grid-cols-[1fr_auto_1.5rem]">
              <MemberChip m={m} />
              <Badge tone={STATUS_TONE[st]}>{STATUS_NAME[st]}</Badge>
              <span className="text-xs text-ink-faint max-md:hidden">{m.individual?.rounds ?? 0} 輪</span>
              <span className="truncate text-xs text-ink-dim max-md:hidden">{m.individual?.claim ?? "—"}</span>
              {c ? (
                <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展開"}${m.name}的結論`} title="蘇格拉底的結論" onClick={() => setOpen(expanded ? null : m.id)}
                  className="cursor-pointer text-ink-faint hover:text-bronze"><ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} /></button>
              ) : <span />}
            </div>
            {expanded && <div className="mb-4 ml-8 border-l-2 border-bronze-dim pl-4"><ConclusionView c={c} /></div>}
          </div>
        );
      })}
    </div>
  );
  if (!solo) return <StageLayout leftLabel={SURVEY_NAME[a.kind]} left={left} rightLabel="成員進度" right={memberList} />;
  return (
    <StageLayout leftLabel={SURVEY_NAME[a.kind]} left={left}
      rightLabel={tab === "members" ? "成員進度" : "全班整合"}
      rightHeader={<ModeTabs items={[["members", "成員進度"], ["synthesis", "全班整合"]]} value={tab} onChange={setTab} />}
      right={tab === "members" ? memberList : <div className="min-h-0 flex-1 overflow-y-auto"><TeacherSynthesisPanel a={a} /></div>} />
  );
}
