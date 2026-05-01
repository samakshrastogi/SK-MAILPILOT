import { useEffect, useState } from "react";
import { FiTrendingUp } from "react-icons/fi";

import { createInboxRule, deleteInboxRule, getEmailAnalytics, listInboxRules } from "../api/email";
import type { EmailAnalytics, InboxRule } from "../types/email";
import type { EmailCategory } from "../types/email";

type SenderInsightsPageProps = {
  accountId?: string | null;
  includeAllAccounts?: boolean;
};

export function SenderInsightsPage({ accountId, includeAllAccounts }: SenderInsightsPageProps) {
  const [analytics, setAnalytics] = useState<EmailAnalytics | null>(null);
  const [rules, setRules] = useState<InboxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleSender, setRuleSender] = useState("");
  const [ruleSubject, setRuleSubject] = useState("");
  const [rulePriority, setRulePriority] = useState<"low" | "medium" | "high" | "">("");
  const [ruleCategory, setRuleCategory] = useState<EmailCategory | "">("");
  const [ruleArchive, setRuleArchive] = useState(false);

  async function loadInsights(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await getEmailAnalytics({ accountId, includeAllAccounts });
      setAnalytics(response.data);
      const rulesResponse = await listInboxRules();
      setRules(rulesResponse.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load sender insights");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInsights(true);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadInsights();
      }
    }, 15000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadInsights();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accountId, includeAllAccounts]);

  const senderInsights = analytics?.senderInsights ?? [];

  async function handleCreateRule() {
    if (!ruleName.trim()) {
      setError("Rule name is required");
      return;
    }
    try {
      await createInboxRule({
        name: ruleName,
        senderContains: ruleSender || null,
        subjectContains: ruleSubject || null,
        bodyContains: null,
        setPriority: rulePriority || null,
        setCategory: ruleCategory || null,
        markNeedsReply: null,
        autoArchive: ruleArchive,
        active: true,
      });
      setRuleName("");
      setRuleSender("");
      setRuleSubject("");
      setRulePriority("");
      setRuleCategory("");
      setRuleArchive(false);
      const rulesResponse = await listInboxRules();
      setRules(rulesResponse.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create inbox rule");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Insights</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sender insights</h2>
          <p className="mt-2 text-sm text-slate-500">Top senders, response rate, and suggested rules.</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Use this page to turn repeated patterns into rules.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
          {loading ? "Updating..." : "Auto-updating"}
        </span>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Top senders</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{senderInsights.length}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Best response rate</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {senderInsights[0] ? `${Math.max(...senderInsights.map((item) => item.responseRate))}%` : "0%"}
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rule suggestions</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {senderInsights.reduce((total, item) => total + item.autoRules.filter((rule) => rule !== "No automation recommended yet").length, 0)}
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Rules</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">Inbox rules engine</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Create rules for repeated sender or subject patterns.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Rule name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={ruleSender} onChange={(e) => setRuleSender(e.target.value)} placeholder="Sender contains" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={ruleSubject} onChange={(e) => setRuleSubject(e.target.value)} placeholder="Subject contains" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={rulePriority} onChange={(e) => setRulePriority(e.target.value as "low" | "medium" | "high" | "")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value as EmailCategory | "")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Category</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="spam">Spam</option>
              <option value="finance">Finance</option>
              <option value="promotions">Promotions</option>
              <option value="updates">Updates</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ruleArchive} onChange={(e) => setRuleArchive(e.target.checked)} />
              Auto-archive
            </label>
            <button type="button" onClick={() => void handleCreateRule()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Save rule
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Rules are applied during inbox sync.
          </p>
          {rules.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs">
                  <span>{rule.name}</span>
                  <button type="button" onClick={() => void deleteInboxRule(rule.id).then(() => listInboxRules().then((response) => setRules(response.data)))} className="text-rose-600">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {senderInsights.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-medium">Sender</th>
                  <th className="px-4 py-3 font-medium">Emails</th>
                  <th className="px-4 py-3 font-medium">Response Rate</th>
                  <th className="px-4 py-3 font-medium">Primary Category</th>
                  <th className="px-4 py-3 font-medium">Auto-rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {senderInsights.map((item) => (
                  <tr key={item.sender} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-900">{item.sender}</td>
                    <td className="px-4 py-4 text-slate-600">{item.count}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        {item.responseRate}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{item.dominantCategory}</td>
                    <td className="px-4 py-4 text-slate-600">{item.autoRules.join(" • ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FiTrendingUp className="text-3xl text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No sender insights yet</p>
            <p className="text-xs text-slate-400">Sync the inbox to populate this view.</p>
          </div>
        )}
      </section>
    </div>
  );
}
