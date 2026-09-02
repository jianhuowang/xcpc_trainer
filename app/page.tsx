"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  BellRing,
  BookOpenCheck,
  Check,
  CircleDot,
  Code2,
  Download,
  Flag,
  Gauge,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MODE_CONFIG, type TrainingMode } from "@/lib/training/modes";

type Evidence =
  | "failed"
  | "editorial_understood"
  | "hinted_ac"
  | "independent_ac";
type HelpLevel = "none" | "h1" | "h2" | "h3" | "unknown";

type Problem = {
  id: number;
  title: string;
  url: string;
  platform: string;
  origin: string;
  status: string;
  cleanStreak: number;
  nextReviewAt: string | null;
};

type DashboardData = {
  due: Problem[];
  queues: {
    upsolve: Problem[];
    transfer: Problem[];
    review: Problem[];
  };
  transferCandidates: Problem[];
  recent: Problem[];
  recentContests: ContestSummary[];
  stats: {
    total: number;
    due: number;
    deferred: number;
    reviewing: number;
    upsolve: number;
    retained: number;
    stable: number;
    transferPending: number;
    quality: {
      sampleSize: number;
      independentPassRate: number | null;
      failedBlindAttempts: number;
      verifiedTransfers: number;
    };
  };
  settings: {
    mode: TrainingMode;
    dailyLimit: number;
    timezone: string;
    reminderTime: string;
  };
  generatedAt: string;
};

type ContestSummary = {
  id: number;
  title: string;
  platform: string;
  contestUrl: string;
  startedAt: string;
  status: string;
  problemCount: number;
  openCount: number;
};

type ContestProblemDraft = {
  key: number;
  title: string;
  url: string;
  evidence: Evidence;
  notes: string;
};

const initialProblem = {
  title: "",
  url: "",
  platform: "codeforces",
  origin: "contest",
  evidence: "failed" as Evidence,
  notes: "",
};

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function newContestProblem(key = Date.now()): ContestProblemDraft {
  return { key, title: "", url: "", evidence: "failed", notes: "" };
}

function newContestForm() {
  return {
    title: "",
    platform: "codeforces",
    contestUrl: "",
    startedAt: todayInShanghai(),
    notes: "",
    problems: [newContestProblem()],
  };
}

const evidenceLabel: Record<Evidence, string> = {
  failed: "没有独立完成",
  editorial_understood: "看题解后理解",
  hinted_ac: "提示后 AC",
  independent_ac: "独立 AC",
};

const statusLabel: Record<string, string> = {
  upsolve: "待补题",
  review: "复习中",
  transfer: "迁移验证",
  retained: "已保持",
  stable: "已稳定",
  mastered: "已保持（旧记录）",
};

const platformLabel: Record<string, string> = {
  codeforces: "Codeforces",
  nowcoder: "牛客",
  atcoder: "AtCoder",
  luogu: "洛谷",
  other: "其他",
};

function localDay(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

async function readJson(response: Response) {
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "请求失败");
  }
  return data;
}

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [contestOpen, setContestOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Problem | null>(null);
  const [transferSource, setTransferSource] = useState<Problem | null>(null);
  const [problemForm, setProblemForm] = useState(initialProblem);
  const [contestForm, setContestForm] = useState(newContestForm);
  const [reviewEvidence, setReviewEvidence] =
    useState<Evidence>("independent_ac");
  const [reviewHelpLevel, setReviewHelpLevel] = useState<HelpLevel>("none");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAttemptKey, setReviewAttemptKey] = useState("");
  const [transferForm, setTransferForm] = useState({
    title: "",
    url: "",
    platform: "codeforces",
  });
  const [saving, setSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await readJson(response);
      setDashboard(data as unknown as DashboardData);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/dashboard", { cache: "no-store" })
      .then(readJson)
      .then((data) => {
        if (!active) return;
        setDashboard(data as unknown as DashboardData);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function createProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(problemForm),
      });
      const result = await readJson(response);
      const decision = result.decision as { reason?: string } | undefined;
      toast.success(result.reactivated ? "旧题已重新激活" : "题目已进入训练队列", {
        description: decision?.reason,
      });
      setProblemForm(initialProblem);
      setAddOpen(false);
      setLoading(true);
      await loadDashboard();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function beginReview(problem: Problem) {
    setReviewing(problem);
    setReviewEvidence("independent_ac");
    setReviewHelpLevel("none");
    setReviewNotes("");
    setReviewAttemptKey(crypto.randomUUID());
  }

  function closeReview() {
    setReviewing(null);
    setReviewAttemptKey("");
  }

  function changeReviewEvidence(evidence: Evidence) {
    setReviewEvidence(evidence);
    if (evidence === "independent_ac") setReviewHelpLevel("none");
    if (evidence === "hinted_ac") setReviewHelpLevel("h1");
    if (evidence === "editorial_understood") setReviewHelpLevel("h3");
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: reviewing.id,
          evidence: reviewEvidence,
          helpLevel: reviewHelpLevel,
          notes: reviewNotes,
          idempotencyKey: reviewAttemptKey,
        }),
      });
      const result = await readJson(response);
      toast.success("下次训练已排好", {
        description: typeof result.scheduleReason === "string" ? result.scheduleReason : undefined,
      });
      closeReview();
      setReviewNotes("");
      setReviewEvidence("independent_ac");
      setReviewHelpLevel("none");
      setLoading(true);
      await loadDashboard();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferSource) return;
    setSaving(true);
    try {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProblemId: transferSource.id,
          ...transferForm,
        }),
      });
      await readJson(response);
      toast.success("无标签迁移题已入队", {
        description: "作答卡片不会显示它关联的原题或旧笔记。",
      });
      setTransferSource(null);
      setTransferForm({ title: "", url: "", platform: "codeforces" });
      setLoading(true);
      await loadDashboard();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "迁移任务创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function createContest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contestForm),
      });
      const result = await readJson(response);
      const created = Array.isArray(result.problems) ? result.problems.length : 0;
      toast.success("赛后记录已入库", {
        description: `${created} 道暴露题目已进入统一补题与复习队列。`,
      });
      setContestForm(newContestForm());
      setContestOpen(false);
      setLoading(true);
      await loadDashboard();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "比赛保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function changeMode(mode: TrainingMode) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await readJson(response);
      toast.success(`已切换到${MODE_CONFIG[mode].label}模式`, {
        description: MODE_CONFIG[mode].description,
      });
      setLoading(true);
      await loadDashboard();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  const stats = dashboard?.stats ?? {
    total: 0,
    due: 0,
    deferred: 0,
    reviewing: 0,
    upsolve: 0,
    retained: 0,
    stable: 0,
    transferPending: 0,
    quality: {
      sampleSize: 0,
      independentPassRate: null,
      failedBlindAttempts: 0,
      verifiedTransfers: 0,
    },
  };

  return (
    <main className="min-h-screen pb-20">
      <header className="border-b border-foreground/20 bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border-2 border-foreground bg-accent shadow-[3px_3px_0_#161712]">
              <span className="font-mono text-xs font-black">AC</span>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                evidence over mood
              </p>
              <p className="text-base font-black tracking-tight">XCPC Trainer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ContestDialog
              open={contestOpen}
              onOpenChange={setContestOpen}
              form={contestForm}
              setForm={setContestForm}
              onSubmit={createContest}
              saving={saving}
            />
            <AddProblemDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              form={problemForm}
              setForm={setProblemForm}
              onSubmit={createProblem}
              saving={saving}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="mb-8 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <CircleDot className="size-3 fill-chart-1 text-chart-1" />
              {new Intl.DateTimeFormat("zh-CN", {
                dateStyle: "long",
                timeZone: "Asia/Shanghai",
              }).format(new Date())}
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl">
              先清债，<span className="text-chart-1">再开新题。</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              赛场暴露问题，补题建立理解，盲重做验证保持；真正稳定还要靠迁移题或后续比赛证明。
            </p>
          </div>
          <div className="rounded-2xl border border-foreground/20 bg-card p-4 shadow-[5px_5px_0_rgb(22_23_18_/_0.12)]">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-chart-2" />
              <div>
                <p className="text-sm font-bold">确定性排程已启用</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  失败 1 天 · 题解 2 天 · 提示 3 天 · 连续独立 3/7/21/45 天
                </p>
              </div>
            </div>
            {dashboard?.settings ? (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-foreground/10 pt-4">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Gauge className="size-4" />今日模式
                </div>
                <Select
                  value={dashboard.settings.mode}
                  disabled={saving}
                  onValueChange={(value) => void changeMode(value as TrainingMode)}
                >
                  <SelectTrigger size="sm" className="w-32 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">正常 · 6</SelectItem>
                    <SelectItem value="recovery">恢复 · 4</SelectItem>
                    <SelectItem value="low_energy">低能量 · 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="今天到期" value={stats.due} accent="bg-chart-1" />
          <Metric label="待补题" value={stats.upsolve} accent="bg-foreground" />
          <Metric label="待迁移" value={stats.transferPending} accent="bg-chart-1" />
          <Metric label="复习中" value={stats.reviewing} accent="bg-chart-3" />
          <Metric label="已保持" value={stats.retained} accent="bg-chart-2" />
          <Metric label="已稳定" value={stats.stable} accent="bg-accent-foreground" />
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.55fr_0.85fr]">
          <div>
            <SectionTitle
              eyebrow="TODAY / BLIND RESOLVE"
              title="今日训练队列"
              count={dashboard?.due.length ?? stats.due}
            />

            {stats.deferred > 0 ? (
              <p className="mb-3 rounded-xl border border-foreground/15 bg-secondary px-4 py-3 text-xs leading-5 text-muted-foreground">
                还有 {stats.deferred} 道已到期题留在债务池中。当前模式只取最早到期的
                {dashboard?.settings.dailyLimit} 道，避免一次性压垮训练。
              </p>
            ) : null}

            {loading ? (
              <LoadingCards />
            ) : error ? (
              <Empty className="border border-foreground/20 bg-card py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <RefreshCw />
                  </EmptyMedia>
                  <EmptyTitle>队列加载失败</EmptyTitle>
                  <EmptyDescription>{error}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    onClick={() => {
                      setLoading(true);
                      void loadDashboard();
                    }}
                  >
                    重新加载
                  </Button>
                </EmptyContent>
              </Empty>
            ) : dashboard?.due.length ? (
              <div className="space-y-6">
                {dashboard.queues.upsolve.length ? (
                  <QueueGroup
                    title="先处理补题债务"
                    description="失败题优先；建立完整解法后再回到盲重做。"
                    items={dashboard.queues.upsolve}
                    startIndex={0}
                    onReview={beginReview}
                  />
                ) : null}
                {dashboard.queues.transfer.length ? (
                  <QueueGroup
                    title="无标签迁移验证"
                    description="它与旧题的关联已经隐藏；第一次作答必须保持完全陌生。"
                    items={dashboard.queues.transfer}
                    startIndex={dashboard.queues.upsolve.length}
                    onReview={beginReview}
                  />
                ) : null}
                {dashboard.queues.review.length ? (
                  <QueueGroup
                    title="再完成盲重做"
                    description="不看旧笔记，完整重建并如实提交本次证据。"
                    items={dashboard.queues.review}
                    startIndex={
                      dashboard.queues.upsolve.length + dashboard.queues.transfer.length
                    }
                    onReview={beginReview}
                  />
                ) : null}
              </div>
            ) : (
              <Empty className="border border-dashed border-foreground/30 bg-card/70 py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Check />
                  </EmptyMedia>
                  <EmptyTitle>今天没有到期任务</EmptyTitle>
                  <EmptyDescription>
                    队列不会为了“保持连续”硬塞新题。录入赛场失误或练习结果后，系统会按证据排期。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus />录入第一道题
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>

          <aside>
            {dashboard?.transferCandidates.length ? (
              <div className="mb-7">
                <SectionTitle
                  eyebrow="TRANSFER GATE"
                  title="待迁移验证"
                  count={dashboard.transferCandidates.length}
                />
                <div className="overflow-hidden rounded-2xl border border-foreground/20 bg-card">
                  {dashboard.transferCandidates.map((problem) => (
                    <div
                      key={problem.id}
                      className="border-b border-foreground/10 p-4 last:border-b-0"
                    >
                      <p className="truncate text-sm font-bold">{problem.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        同题保持已通过，仍缺一道陌生迁移题证明可迁移能力。
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full bg-background"
                        onClick={() => setTransferSource(problem)}
                      >
                        <Flag />安排无标签迁移题
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {dashboard?.recentContests.length ? (
              <div className="mb-7">
                <SectionTitle
                  eyebrow="CONTEST → UPSOLVE"
                  title="最近比赛"
                  count={dashboard.recentContests.length}
                />
                <div className="overflow-hidden rounded-2xl border border-foreground/20 bg-card">
                  {dashboard.recentContests.map((contest) => (
                    <div
                      key={contest.id}
                      className="border-b border-foreground/10 p-4 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{contest.title}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {platformLabel[contest.platform] ?? contest.platform} · {localDay(contest.startedAt)}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 bg-background">
                          {contest.openCount}/{contest.problemCount} 未掌握
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <SectionTitle eyebrow="LEDGER" title="最近记录" count={stats.total} />
            <div className="overflow-hidden rounded-2xl border border-foreground/20 bg-card">
              {loading ? (
                <div className="space-y-4 p-4">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-14 w-full" />
                  ))}
                </div>
              ) : dashboard?.recent.length ? (
                dashboard.recent.map((problem) => (
                  <div
                    key={problem.id}
                    className="border-b border-foreground/10 p-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{problem.title}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {platformLabel[problem.platform] ?? problem.platform} · 下次 {localDay(problem.nextReviewAt)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          problem.status === "retained" ||
                          problem.status === "mastered" ||
                          problem.status === "stable"
                            ? "border-chart-2 bg-accent"
                            : "bg-background"
                        }
                      >
                        {statusLabel[problem.status] ?? problem.status}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">暂无记录</p>
              )}
            </div>
            <div className="mt-4 rounded-2xl bg-foreground p-5 text-background">
              <BookOpenCheck className="size-5 text-accent" />
              <p className="mt-3 text-sm font-bold">盲做规则</p>
              <p className="mt-1 text-xs leading-6 text-background/65">
                开题前不展示算法标签、旧笔记或题解。先独立重建，再如实记录证据。
              </p>
            </div>
            <div className="mt-3 rounded-2xl border border-foreground/20 bg-card p-4">
              <p className="text-sm font-bold">训练质量</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                只统计盲重做和迁移尝试，不把首次录入或平台 AC 混进来。
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <QualityMetric
                  label="独立率"
                  value={
                    stats.quality.independentPassRate === null
                      ? "—"
                      : `${stats.quality.independentPassRate}%`
                  }
                />
                <QualityMetric
                  label="盲做样本"
                  value={String(stats.quality.sampleSize)}
                />
                <QualityMetric
                  label="迁移通过"
                  value={String(stats.quality.verifiedTransfers)}
                />
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-foreground/20 bg-card p-4">
              <div className="flex items-start gap-3">
                <BellRing className="mt-0.5 size-5 shrink-0 text-chart-3" />
                <div>
                  <p className="text-sm font-bold">提醒任务层已就绪</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    已具备每日扫描、去重和任务留痕；发送通道尚未接密钥，不会假装已经发出提醒。
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="bg-card">
                <a href="/api/export" download>
                  <Download />导出备份
                </a>
              </Button>
              <ImportDialog onImported={() => void loadDashboard()} />
              <CodeforcesImportDialog onImported={() => void loadDashboard()} />
            </div>
          </aside>
        </section>
      </div>

      <ReviewDialog
        problem={reviewing}
        onClose={closeReview}
        evidence={reviewEvidence}
        setEvidence={changeReviewEvidence}
        helpLevel={reviewHelpLevel}
        setHelpLevel={setReviewHelpLevel}
        notes={reviewNotes}
        setNotes={setReviewNotes}
        onSubmit={submitReview}
        saving={saving}
      />
      <TransferDialog
        source={transferSource}
        onClose={() => setTransferSource(null)}
        form={transferForm}
        setForm={setTransferForm}
        onSubmit={createTransfer}
        saving={saving}
      />
    </main>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-foreground/20 bg-card p-4 sm:p-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${accent}`} />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black tabular-nums tracking-tight">{value}</p>
    </article>
  );
}

function QualityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary p-3 text-center">
      <p className="font-mono text-lg font-black">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-chart-1">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{count} ITEMS</span>
    </div>
  );
}

function QueueGroup({
  title,
  description,
  items,
  startIndex,
  onReview,
}: {
  title: string;
  description: string;
  items: Problem[];
  startIndex: number;
  onReview: (problem: Problem) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-black">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {items.length} ITEMS
        </span>
      </div>
      <div className="space-y-3">
        {items.map((problem, index) => (
          <DueCard
            key={problem.id}
            problem={problem}
            index={startIndex + index}
            onReview={onReview}
          />
        ))}
      </div>
    </div>
  );
}

function DueCard({
  problem,
  index,
  onReview,
}: {
  problem: Problem;
  index: number;
  onReview: (problem: Problem) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-foreground/25 bg-card shadow-[4px_4px_0_rgb(255_92_53_/_0.2)]">
      <div className="flex">
        <div className="grid w-14 shrink-0 place-items-center bg-chart-1 font-mono text-lg font-black text-white sm:w-16">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="outline">{platformLabel[problem.platform] ?? problem.platform}</Badge>
                <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                  {problem.status === "upsolve"
                    ? "补题债务"
                    : problem.status === "transfer"
                      ? "无标签迁移"
                    : problem.status === "retained" || problem.status === "mastered"
                      ? "低频保持"
                      : `连续独立 ${problem.cleanStreak}`}
                </Badge>
              </div>
              <h3 className="text-lg font-black leading-snug tracking-tight">{problem.title}</h3>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                到期 {localDay(problem.nextReviewAt)} · 先盲做，不看旧笔记
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {problem.url ? (
              <Button asChild variant="outline" className="sm:flex-1">
                <a href={problem.url} target="_blank" rel="noreferrer">
                  打开原题 <ArrowUpRight />
                </a>
              </Button>
            ) : null}
            <Button className="sm:flex-1" onClick={() => onReview(problem)}>
              <RotateCcw />记录重做结果
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-3">
      {[0, 1].map((item) => (
        <div key={item} className="flex overflow-hidden rounded-2xl border bg-card">
          <Skeleton className="h-40 w-14 rounded-none sm:w-16" />
          <div className="flex-1 space-y-3 p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContestDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnType<typeof newContestForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof newContestForm>>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  function updateProblem(key: number, patch: Partial<ContestProblemDraft>) {
    setForm((current) => ({
      ...current,
      problems: current.problems.map((problem) =>
        problem.key === key ? { ...problem, ...patch } : problem,
      ),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="bg-card">
          <Flag />赛后
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>建立赛后补题会话</DialogTitle>
          <DialogDescription>
            只录入这场比赛真正暴露问题的题；它们会立即进入补题与盲重做链路。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="比赛名称" required>
              <Input
                required
                maxLength={160}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="例如：CF Round 1050"
              />
            </Field>
            <Field label="比赛日期" required>
              <Input
                required
                type="date"
                value={form.startedAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, startedAt: event.target.value }))
                }
              />
            </Field>
            <Field label="平台">
              <Select
                value={form.platform}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, platform: value }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="codeforces">Codeforces</SelectItem>
                  <SelectItem value="nowcoder">牛客</SelectItem>
                  <SelectItem value="atcoder">AtCoder</SelectItem>
                  <SelectItem value="luogu">洛谷</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="比赛链接">
              <Input
                type="url"
                value={form.contestUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, contestUrl: event.target.value }))
                }
                placeholder="https://..."
              />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>本场暴露题目 *</Label>
                <p className="mt-1 text-xs text-muted-foreground">默认记为未独立完成，可逐题修改证据。</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={form.problems.length >= 20}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    problems: [
                      ...current.problems,
                      newContestProblem(
                        Math.max(...current.problems.map((problem) => problem.key)) + 1,
                      ),
                    ],
                  }))
                }
              >
                <Plus />加一题
              </Button>
            </div>
            {form.problems.map((problem, index) => (
              <div
                key={problem.key}
                className="space-y-3 rounded-2xl border border-foreground/20 bg-background p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold">PROBLEM {index + 1}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={form.problems.length === 1}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        problems: current.problems.filter((item) => item.key !== problem.key),
                      }))
                    }
                    aria-label={`删除第 ${index + 1} 道题`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Input
                  required
                  maxLength={160}
                  value={problem.title}
                  onChange={(event) => updateProblem(problem.key, { title: event.target.value })}
                  placeholder="题目名称，例如 C. Graph Problem"
                />
                <Input
                  type="url"
                  value={problem.url}
                  onChange={(event) => updateProblem(problem.key, { url: event.target.value })}
                  placeholder="原题链接（可选）"
                />
                <Select
                  value={problem.evidence}
                  onValueChange={(value) =>
                    updateProblem(problem.key, { evidence: value as Evidence })
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="failed">没有独立完成</SelectItem>
                    <SelectItem value="editorial_understood">看题解后理解</SelectItem>
                    <SelectItem value="hinted_ac">提示后 AC</SelectItem>
                    <SelectItem value="independent_ac">独立 AC</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={problem.notes}
                  onChange={(event) => updateProblem(problem.key, { notes: event.target.value })}
                  placeholder="卡点简记（盲做前不展示）"
                />
              </div>
            ))}
          </div>

          <Field label="整场复盘（可选）">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="时间分配、读题、榜单干扰、策略问题……"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "入库中…" : `保存比赛与 ${form.problems.length} 道题`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ImportPreview = {
  version: number;
  contests: { add: number; skip: number };
  problems: { add: number; skip: number };
  attempts: { add: number };
  settings: { add: number; skip: number };
};

function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [working, setWorking] = useState(false);

  async function inspectFile(file?: File) {
    setPreview(null);
    setPayload(null);
    setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 2_500_000) {
      toast.error("备份文件不能超过 2.5 MB");
      return;
    }
    setWorking(true);
    try {
      const data = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, data }),
      });
      const result = await readJson(response);
      setPayload(data);
      setPreview(result.preview as unknown as ImportPreview);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法读取备份");
    } finally {
      setWorking(false);
    }
  }

  async function importBackup() {
    if (!payload || !preview) return;
    setWorking(true);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, data: payload }),
      });
      await readJson(response);
      toast.success("备份合并完成", {
        description: `新增 ${preview.problems.add} 道题，跳过 ${preview.problems.skip} 道重复题。`,
      });
      setOpen(false);
      setPayload(null);
      setPreview(null);
      setFileName("");
      onImported();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "导入失败");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-card">
          <Upload />导入备份
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>合并训练备份</DialogTitle>
          <DialogDescription>
            先校验并预览，再执行合并。已有题目按链接或“平台 + 题名”去重，不会清空当前数据。
          </DialogDescription>
        </DialogHeader>
        <Field label="选择 XCPC Trainer JSON 备份">
          <Input
            type="file"
            accept="application/json,.json"
            disabled={working}
            onChange={(event) => void inspectFile(event.target.files?.[0])}
          />
        </Field>
        {fileName ? (
          <p className="font-mono text-xs text-muted-foreground">{fileName}</p>
        ) : null}
        {preview ? (
          <div className="rounded-2xl border border-foreground/20 bg-background p-4">
            <p className="text-sm font-bold">校验通过 · 格式 v{preview.version}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <ImportMetric label="新增比赛" value={preview.contests.add} />
              <ImportMetric label="新增题目" value={preview.problems.add} />
              <ImportMetric label="尝试记录" value={preview.attempts.add} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              将跳过 {preview.contests.skip} 场重复比赛和 {preview.problems.skip} 道重复题；
              {preview.settings.skip
                ? "保留当前训练设置。"
                : "写入备份中的训练设置。"}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!preview || working}
            onClick={() => void importBackup()}
            className="w-full sm:w-auto"
          >
            {working ? "处理中…" : "确认合并"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary px-2 py-3">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

type CodeforcesCandidate = {
  key: string;
  title: string;
  url: string;
  contestId: number | null;
  index: string;
  rating: number | null;
  accepted: boolean;
  submissionCount: number;
  lastSubmissionAt: string;
  suggestedEvidence: "failed" | null;
  tracked: boolean;
  trackedStatus: string | null;
  reactivatable: boolean;
  selected: boolean;
  evidence: Evidence | null;
};

function CodeforcesImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [candidates, setCandidates] = useState<CodeforcesCandidate[]>([]);
  const [working, setWorking] = useState(false);
  const [warning, setWarning] = useState("");

  function updateCandidate(key: string, patch: Partial<CodeforcesCandidate>) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.key === key ? { ...candidate, ...patch } : candidate,
      ),
    );
  }

  async function fetchSubmissions() {
    if (!handle.trim()) return;
    setWorking(true);
    try {
      const response = await fetch(
        `/api/integrations/codeforces?handle=${encodeURIComponent(handle.trim())}&count=60`,
        { cache: "no-store" },
      );
      const result = await readJson(response);
      const rows = (result.candidates ?? []) as unknown as Omit<
        CodeforcesCandidate,
        "selected" | "evidence"
      >[];
      setCandidates(
        rows.map((candidate) => ({
          ...candidate,
          selected:
            (!candidate.tracked || candidate.reactivatable) && !candidate.accepted,
          evidence: candidate.suggestedEvidence,
        })),
      );
      setWarning(typeof result.evidenceWarning === "string" ? result.evidenceWarning : "");
      if (!rows.length) toast.info("最近没有可导入的提交记录");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Codeforces 同步失败");
    } finally {
      setWorking(false);
    }
  }

  async function importSelected() {
    const selected = candidates.filter(
      (candidate) =>
        candidate.selected && (!candidate.tracked || candidate.reactivatable),
    );
    if (!selected.length) {
      toast.error("请至少选择一道题");
      return;
    }
    if (selected.some((candidate) => !candidate.evidence)) {
      toast.error("AC 不能自动等于独立完成，请逐题确认训练证据");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/integrations/codeforces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((candidate) => ({
            title: candidate.title,
            url: candidate.url,
            evidence: candidate.evidence,
          })),
        }),
      });
      const result = await readJson(response);
      toast.success("Codeforces 记录已合并", {
        description: `新增 ${Number(result.imported ?? 0)} 道，重新激活 ${Number(result.reactivated ?? 0)} 道，跳过 ${Number(result.skipped ?? 0)} 道。`,
      });
      setCandidates([]);
      setWarning("");
      setOpen(false);
      onImported();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Codeforces 导入失败");
    } finally {
      setWorking(false);
    }
  }

  const selectedCount = candidates.filter(
    (candidate) =>
      candidate.selected && (!candidate.tracked || candidate.reactivatable),
  ).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="col-span-2 bg-card">
          <Code2 />从 Codeforces 同步
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Codeforces 提交候选</DialogTitle>
          <DialogDescription>
            只读取公开提交，不需要密码或 Codeforces API key。最近未通过的题默认勾选；AC 题必须手动确认证据。
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="Codeforces handle"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Button disabled={working || !handle.trim()} onClick={() => void fetchSubmissions()}>
            <RefreshCw className={working ? "animate-spin" : ""} />读取
          </Button>
        </div>
        {warning ? (
          <p className="rounded-xl border border-chart-1/30 bg-chart-1/10 px-4 py-3 text-xs leading-5">
            {warning}
          </p>
        ) : null}
        {candidates.length ? (
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <div
                key={candidate.key}
                className={`rounded-2xl border p-3 ${
                  candidate.tracked && !candidate.reactivatable
                    ? "border-foreground/10 bg-muted/50 opacity-65"
                    : "border-foreground/20 bg-background"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`cf-${candidate.key}`}
                    className="mt-1"
                    checked={candidate.selected}
                    disabled={candidate.tracked && !candidate.reactivatable}
                    onCheckedChange={(checked) =>
                      updateCandidate(candidate.key, {
                        selected: Boolean(checked),
                        evidence:
                          Boolean(checked) && !candidate.accepted
                            ? "failed"
                            : candidate.evidence,
                      })
                    }
                  />
                  <label htmlFor={`cf-${candidate.key}`} className="min-w-0 flex-1 cursor-pointer">
                    <p className="text-sm font-bold leading-5">{candidate.title}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {candidate.rating ? `${candidate.rating} · ` : ""}
                      {candidate.accepted ? "已有 AC" : "尚未通过"} · {candidate.submissionCount} 次提交 · {localDay(candidate.lastSubmissionAt)}
                    </p>
                  </label>
                  {candidate.reactivatable ? (
                    <Badge variant="outline" className="border-chart-1/40 bg-chart-1/10">
                      可重新激活
                    </Badge>
                  ) : candidate.tracked ? (
                    <Badge variant="outline">已入库</Badge>
                  ) : null}
                </div>
                {candidate.selected && (!candidate.tracked || candidate.reactivatable) ? (
                  <Select
                    value={candidate.evidence ?? undefined}
                    onValueChange={(value) =>
                      updateCandidate(candidate.key, { evidence: value as Evidence })
                    }
                  >
                    <SelectTrigger className="mt-3 w-full">
                      <SelectValue placeholder="确认这道题的真实证据" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="failed">没有独立完成</SelectItem>
                      <SelectItem value="editorial_understood">看题解后理解</SelectItem>
                      <SelectItem value="hinted_ac">提示后 AC</SelectItem>
                      <SelectItem value="independent_ac">独立 AC</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={working || selectedCount === 0}
            onClick={() => void importSelected()}
            className="w-full sm:w-auto"
          >
            {working ? "处理中…" : `导入已选 ${selectedCount} 道`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProblemDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: typeof initialProblem;
  setForm: React.Dispatch<React.SetStateAction<typeof initialProblem>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="shadow-[3px_3px_0_#ff5c35]">
          <Plus />录题
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>录入训练证据</DialogTitle>
          <DialogDescription>
            只记录真实发生的结果，后端会自动决定下次出现时间。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="题目名称" required>
            <Input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="例如：Codeforces Round #... C"
            />
          </Field>
          <Field label="原题链接">
            <Input
              type="url"
              value={form.url}
              onChange={(event) =>
                setForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://..."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="平台">
              <Select
                value={form.platform}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, platform: value }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="codeforces">Codeforces</SelectItem>
                  <SelectItem value="nowcoder">牛客</SelectItem>
                  <SelectItem value="atcoder">AtCoder</SelectItem>
                  <SelectItem value="luogu">洛谷</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="来源">
              <Select
                value={form.origin}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, origin: value }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contest">真实比赛</SelectItem>
                  <SelectItem value="practice">日常练习</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="这次做到什么程度？" required>
            <Select
              value={form.evidence}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, evidence: value as Evidence }))
              }
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="failed">没有独立完成</SelectItem>
                <SelectItem value="editorial_understood">看题解后理解</SelectItem>
                <SelectItem value="hinted_ac">提示后 AC</SelectItem>
                <SelectItem value="independent_ac">独立 AC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="复盘笔记（不会在盲做前展示）">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="卡在哪里、为什么错、下次要验证什么……"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "保存中…" : "保存并排期"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  problem,
  onClose,
  evidence,
  setEvidence,
  helpLevel,
  setHelpLevel,
  notes,
  setNotes,
  onSubmit,
  saving,
}: {
  problem: Problem | null;
  onClose: () => void;
  evidence: Evidence;
  setEvidence: (value: Evidence) => void;
  helpLevel: HelpLevel;
  setHelpLevel: (value: HelpLevel) => void;
  notes: string;
  setNotes: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <Dialog open={Boolean(problem)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>重做结果</DialogTitle>
          <DialogDescription>{problem?.title}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="在不看旧笔记的情况下，你做到了哪一步？">
            <div className="grid gap-2">
              {(Object.keys(evidenceLabel) as Evidence[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setEvidence(value)}
                  className={`flex min-h-11 items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${
                    evidence === value
                      ? "border-foreground bg-accent shadow-[2px_2px_0_#161712]"
                      : "border-foreground/20 bg-background hover:border-foreground/50"
                  }`}
                >
                  {evidenceLabel[value]}
                  {evidence === value ? <Check className="size-4" /> : null}
                </button>
              ))}
            </div>
          </Field>
          <Field label="本次实际使用的帮助等级">
            <Select
              value={helpLevel}
              onValueChange={(value) => setHelpLevel(value as HelpLevel)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none</SelectItem>
                <SelectItem value="h1">H1</SelectItem>
                <SelectItem value="h2">H2</SelectItem>
                <SelectItem value="h3">H3</SelectItem>
                <SelectItem value="unknown">unknown</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="本次复盘（可选）">
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="本次是否真正重建了关键思路？"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "排期中…" : "提交证据并排期"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  source,
  onClose,
  form,
  setForm,
  onSubmit,
  saving,
}: {
  source: Problem | null;
  onClose: () => void;
  form: { title: string; url: string; platform: string };
  setForm: React.Dispatch<
    React.SetStateAction<{ title: string; url: string; platform: string }>
  >;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>安排无标签迁移题</DialogTitle>
          <DialogDescription>
            为「{source?.title}」添加一道同类但陌生的题。最好让模型或队友代选；入队后作答卡片不会显示二者关联。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="迁移题名称" required>
            <Input
              required
              maxLength={160}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="只写题目名称，不写算法标签"
            />
          </Field>
          <Field label="题目链接">
            <Input
              type="url"
              value={form.url}
              onChange={(event) =>
                setForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://..."
            />
          </Field>
          <Field label="平台">
            <Select
              value={form.platform}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, platform: value }))
              }
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="codeforces">Codeforces</SelectItem>
                <SelectItem value="nowcoder">牛客</SelectItem>
                <SelectItem value="atcoder">AtCoder</SelectItem>
                <SelectItem value="luogu">洛谷</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="rounded-xl border border-foreground/15 bg-secondary px-4 py-3 text-xs leading-5 text-muted-foreground">
            第一次作答若失败、看题解或使用提示，这道题会被标记为“已暴露”，之后即使 AC 也不能再作为迁移证明，需要换一道陌生题。
          </p>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "入队中…" : "隐藏关联并入队"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="ml-1 text-chart-1">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
