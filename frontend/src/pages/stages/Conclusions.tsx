import { useConclusions, useMembers, useSynthesis, useSynthesisActions } from "@/api/queries";
import type { Activity, ClassSynthesis, StudentConclusion } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";

const Pending = ({ text }: { text: string }) => (
  <p className="flex items-center gap-2 text-[13px] text-ink-dim">
    <span className="inline-flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="size-1.5 animate-pulse rounded-full bg-bronze" style={{ animationDelay: `${i * 0.2}s` }} />)}</span>{text}
  </p>
);

/** 一位同學的 LLM 結論：結論摘要、思考的亮點、思辨過程的變化 */
export function ConclusionView({ c }: { c: StudentConclusion }) {
  if (c.status === "pending") return <Pending text="蘇格拉底正在寫下結論……" />;
  if (c.status === "failed") return <p className="text-[13px] text-wine">結論產生失敗，請稍後再試。</p>;
  return (
    <div className="space-y-3.5">
      <p className="font-serif text-[15px] leading-relaxed">{c.summary}</p>
      <div>
        <small className="mb-1 block text-[11px] tracking-wider text-ink-faint">思考的亮點</small>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed">{c.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </div>
      <div>
        <small className="mb-1 block text-[11px] tracking-wider text-ink-faint">思辨過程的變化</small>
        <p className="text-[13.5px] leading-relaxed">{c.evolution}</p>
      </div>
    </div>
  );
}

/** 學生自己的結論（結算畫面） */
export function MyConclusion({ a }: { a: Activity }) {
  const { data: list = [] } = useConclusions(a.id);
  const mine = list.find((c) => c.isMine);
  return mine ? <ConclusionView c={mine} /> : <Pending text="蘇格拉底正在寫下結論……" />;
}

/** 全班結論整合的內容（老師與學生共用） */
export function SynthesisView({ s }: { s: ClassSynthesis }) {
  if (s.status === "pending") return <Pending text={`正在整合 ${s.basedOn} 位同學的結論……`} />;
  if (s.status === "failed") return <p className="text-[13px] text-wine">整合失敗，請重新產生。</p>;
  return (
    <div className="space-y-5">
      <p className="font-serif text-[15px] leading-relaxed">{s.overview}</p>
      <div>
        <small className="mb-2 block text-[11px] tracking-wider text-ink-faint">主要觀點</small>
        <ul className="space-y-3">
          {s.themes.map((t, i) => (
            <li key={i} className="border-l-2 border-bronze-dim pl-3">
              <div className="flex items-start justify-between gap-3"><b className="font-serif text-[14px] font-medium">{t.title}</b><Badge tone="bronze">{t.count} 人</Badge></div>
              <p className="mt-0.5 text-[12.5px] text-ink-dim">{t.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <small className="mb-1 block text-[11px] tracking-wider text-ink-faint">主要分歧</small>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed">{s.tensions.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      {s.generatedAt && <p className="text-[11.5px] text-ink-faint">根據 {s.basedOn} 位同學的結論整合 · {formatDateTime(s.generatedAt)}</p>}
    </div>
  );
}

/** 學生的「全班」分頁：老師公開後才看得到全班整合，以及每位同學的匿名結論 */
export function ClassResults({ a }: { a: Activity }) {
  const { data: s } = useSynthesis(a.id);
  const { data: list = [] } = useConclusions(a.id);
  if (!s) return <p className="px-5 py-4 text-sm text-ink-faint">老師還沒有公開全班的結算。</p>;
  const others = [...list].sort((x, y) => Number(y.isMine) - Number(x.isMine));
  return (
    <div>
      <section className="border-b border-line px-5 py-4">
        <small className="mb-2 block text-[11px] tracking-wider text-bronze">全班整合</small>
        <SynthesisView s={s} />
      </section>
      <section className="px-5 py-4">
        <small className="mb-1 block text-[11px] tracking-wider text-bronze">每位同學的結論 · {list.length} 人</small>
        <p className="mb-3 text-[11.5px] text-ink-faint">其他同學以匿名顯示。</p>
        {others.map((c) => (
          <article key={c.memberId} className="border-t border-line py-4 first:border-t-0">
            <b className={cn("mb-2 block text-[13px] font-medium", c.isMine && "text-bronze")}>{c.memberName}</b>
            <ConclusionView c={c} />
          </article>
        ))}
      </section>
    </div>
  );
}

/** 老師：產生、重新產生、公開全班整合 */
export function TeacherSynthesisPanel({ a }: { a: Activity }) {
  const { data: s } = useSynthesis(a.id);
  const { data: members = [] } = useMembers(a.id);
  const { generate, publish } = useSynthesisActions(a.id);
  const done = members.filter((m) => m.individual?.status === "done").length;
  const error = generate.error ?? publish.error;
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {s && s.status === "ready" && <Badge tone={s.published ? "olive" : "neutral"}>{s.published ? "已公開給學生" : "未公開"}</Badge>}
        <span className="text-[12.5px] text-ink-faint">目前已完成 {done} / {members.length} 人{s && s.status === "ready" && s.basedOn !== done ? `（整合時是 ${s.basedOn} 人，可以重新產生）` : ""}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={s ? "outline" : "default"} disabled={!done || generate.isPending || s?.status === "pending"} onClick={() => generate.mutate()}>{s ? "重新產生" : "產生全班整合"}</Button>
        {s && s.status === "ready" && <Button size="sm" variant={s.published ? "outline" : "default"} disabled={publish.isPending} onClick={() => publish.mutate(!s.published)}>{s.published ? "取消公開" : "公開給學生"}</Button>}
      </div>
      {!s && <p className="text-[12.5px] leading-relaxed text-ink-faint">由 AI 整合所有已完成同學的結論：整體結論、主要觀點與人數、主要分歧。產生後先由你檢查，再決定是否公開給學生。</p>}
      {s?.status === "ready" && !s.published && <p className="text-[12px] leading-relaxed text-ink-faint">公開後，已完成的學生會在結算畫面的「全班」分頁看到這份整合，以及所有同學的結論（其他同學以匿名顯示）。重新產生會回到「未公開」。</p>}
      {error && <p className="text-[12.5px] text-wine">{error.message}</p>}
      {s && <div className="border-t border-line pt-4"><SynthesisView s={s} /></div>}
    </div>
  );
}
