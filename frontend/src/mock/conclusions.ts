/**
 * 個人辯論的「LLM 結論」示範版：用規則從對話與論點拼出文字，只在 mock 模式使用。
 * 真正的內容由後端呼叫 LLM 產生（個人結論：結論摘要、思考的亮點、思辨過程的變化；全班整合：整體結論、主要觀點、分歧）。
 */

type Summary = { claim: string; reason: string; evidence: string };
type Coverage = { claim: boolean; reason: boolean; evidence: boolean; counter: boolean };

/** 截短並拿掉句尾標點（引號外面會再接標點，避免出現「……。」。） */
const clip = (s: string, n = 40) => {
  const t = s.trim().replace(/[。！？!?.，,]+$/, "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

export function studentConclusion(name: string, s: Summary, firstText: string, coverage: Coverage, rounds: number) {
  const who = name;
  const summary = s.reason && s.reason !== s.claim
    ? `${who}最後的立場是「${clip(s.claim)}」，主要的理由是「${clip(s.reason)}」。`
    : `${who}最後的立場是「${clip(s.claim)}」。`;

  const highlights: string[] = [];
  if (coverage.evidence && s.evidence) highlights.push(`用具體的例子支撐想法：「${clip(s.evidence, 32)}」。`);
  if (coverage.reason) highlights.push("不只說出主張，也說明了為什麼這樣想。");
  if (coverage.counter) highlights.push("面對反例沒有閃避，而是回頭修正自己的說法。");
  if (rounds >= 5) highlights.push(`持續了 ${rounds} 輪對話，願意把問題想得更深。`);
  if (!highlights.length) highlights.push("清楚說出了自己的主張，這是往下追問的起點。");

  const first = firstText.trim();
  const evolution = first && first !== s.claim
    ? `一開始${who}說「${clip(first, 32)}」，經過追問後，收斂成「${clip(s.claim, 32)}」。`
    : `${who}的立場從頭到尾一致，但隨著追問，理由與例子越說越具體。`;
  return { summary, highlights, evolution };
}

/** 依主張的相似程度粗略分群（示範用：同一句開頭視為同一觀點） */
export function classSynthesis(items: { name: string; claim: string }[]) {
  const groups = new Map<string, { title: string; names: string[] }>();
  for (const it of items) {
    const key = it.claim.replace(/「[^」]*」/g, "").replace(/[，。、！？\s]/g, "").slice(0, 6) || "（沒有主張）";
    const g = groups.get(key) ?? { title: clip(it.claim, 36), names: [] };
    g.names.push(it.name);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.names.length - a.names.length);
  const themes = sorted.slice(0, 4).map((g) => ({
    title: g.title,
    // 全班整合會公開給學生，不能出現姓名
    detail: `${g.names.length} 位同學持這個看法。`,
    count: g.names.length,
  }));
  const tensions = sorted.length >= 2
    ? [`「${clip(sorted[0].title, 20)}」與「${clip(sorted[1].title, 20)}」之間，對同一件事的判準不同，值得在課堂上讓兩邊互相追問。`]
    : ["大家的看法很接近；可以試著找出一個例外情況，看看共識是否還站得住。"];
  const overview = `共有 ${items.length} 位同學完成個人思辨，整理出 ${groups.size} 種主要看法。`
    + (themes[0] ? `其中最多人認為「${clip(themes[0].title, 24)}」。` : "");
  return { overview, themes, tensions };
}

/** 個人辯論沒有價值軸：模擬同學用幾種立場不同的論點（示範全班整合時才有分歧可看） */
const SIM_STANCES = [
  { claim: "我傾向同意，但要看情況", reason: "同一件事放在不同處境，對錯可能不一樣", evidence: "像醫生在病人情緒不穩時，會先緩一緩再說" },
  { claim: "我不同意，原則上不應該例外", reason: "一旦開了例外，就很難說清楚界線在哪", evidence: "很多人說謊時都覺得自己是好意" },
  { claim: "我同意，因為結果比動機重要", reason: "最後有沒有傷害到人，才是判斷的重點", evidence: "善意的謊言讓朋友免於難堪" },
  { claim: "我還沒有定論，兩邊都有道理", reason: "原則和結果在這件事上互相拉扯", evidence: "我自己遇過說實話反而傷人的情況" },
];
export function simIndividualSummary(index: number) {
  const s = SIM_STANCES[index % SIM_STANCES.length];
  return { claim: s.claim, reason: s.reason, evidence: s.evidence };
}
