import {
  FiActivity,
  FiBookOpen,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiMail,
  FiMessageCircle,
  FiShield,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";

function GuideStep({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-semibold text-sky-700">
          {step}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  purpose,
  steps,
}: {
  icon: React.ReactNode;
  title: string;
  purpose: string;
  steps: string[];
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{purpose}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div key={`${title}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            <span className="font-semibold text-slate-900">Step {index + 1}.</span> {step}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TutorialPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
            <FiBookOpen className="text-xl" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Tutorial</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">SK MailPilot guide</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This page explains what each section does, when to use it, and the exact steps to complete the main workflows inside MailPilot.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <FiShield className="text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">1. Get access</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Verify the mailbox, complete approval if needed, and connect the correct Gmail account before you try to sync.
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <FiMail className="text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">2. Work the inbox</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sync messages, review priorities, inspect attachments, reply, schedule, and organize email traffic from one workspace.
          </p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <FiTrendingUp className="text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">3. Improve operations</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use insights, rules, audit, sync history, and team ownership to make mailbox work repeatable and easier to manage.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="px-1 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Start Here</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Recommended setup order</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Follow this order the first time so every later section works correctly.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <GuideStep
            step="1"
            title="Sign in"
            description="Log in with your MailPilot account. If this is a new account, finish the required verification before continuing."
          />
          <GuideStep
            step="2"
            title="Open the mailbox access flow"
            description="Use the Gmail access modal when no mailbox is connected or when testing mode still restricts the mailbox you want to use."
          />
          <GuideStep
            step="3"
            title="Verify the mailbox with Google"
            description="Enter the Gmail address you want to connect, continue to Google, and sign in with that exact mailbox."
          />
          <GuideStep
            step="4"
            title="Wait for approval if required"
            description="If the mailbox is not already approved, MailPilot sends the verified request for admin approval. Once approved, the mailbox becomes ready to connect."
          />
          <GuideStep
            step="5"
            title="Connect the approved mailbox"
            description="Return to the access modal and connect the approved Gmail mailbox so MailPilot can sync and act on it."
          />
          <GuideStep
            step="6"
            title="Run the first sync"
            description="Use Sync inbox from the header. This fetches Gmail messages, processes them, applies rules, and updates dashboard analytics."
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          icon={<FiActivity className="text-lg" />}
          title="Overview"
          purpose="Purpose: Overview is the control panel for the current mailbox scope. Use it to understand workload, urgency, and recent activity before opening individual emails."
          steps={[
            "Review processed email totals, recent sync status, pending replies, and top senders.",
            "Use the pills or linked sections to open Insights or Sync History when you need detail behind a dashboard number.",
            "Use this page first after every sync to decide what should be handled next.",
          ]}
        />

        <SectionCard
          icon={<FiMail className="text-lg" />}
          title="Emails"
          purpose="Purpose: Emails is the main inbox workspace. Use it for triage, filtering, reading, replying, deleting, and checking attachment intelligence."
          steps={[
            "Set filters like sender, category, priority, date range, pending replies, or thread view to narrow the inbox.",
            "Open any email card to inspect the body, attachment summary, extracted fields, reply status, and SLA indicators.",
            "Use reply actions, bulk actions, or sender-based cleanup when you want to process many messages quickly.",
          ]}
        />

        <SectionCard
          icon={<FiFileText className="text-lg" />}
          title="Compose"
          purpose="Purpose: Compose is for new outbound email, drafts, recurring communication, and scheduled sends."
          steps={[
            "Enter recipients, subject, and body or use a saved smart draft template to start faster.",
            "Choose whether the email should send now, be saved as a draft, or be scheduled for later delivery.",
            "Review the outbox and scheduled list to confirm that future sends are configured correctly.",
          ]}
        />

        <SectionCard
          icon={<FiTrendingUp className="text-lg" />}
          title="Sender Insights"
          purpose="Purpose: Sender Insights explains who sends the most email and where automation will help. Use it to discover patterns and create rules."
          steps={[
            "Review top senders, response rate, dominant categories, and suggested automation opportunities.",
            "Create a rule when the same sender or subject pattern repeats often enough to automate.",
            "Return here after syncs to see whether the sender mix or suggested rules have changed.",
          ]}
        />

        <SectionCard
          icon={<FiClock className="text-lg" />}
          title="Sync History"
          purpose="Purpose: Sync History shows what happened during each sync run and helps explain why the inbox or dashboard changed."
          steps={[
            "Open the latest run to review fetched, processed, skipped, and failed counts.",
            "Check duration and failure reasons if sync looks slow or incomplete.",
            "Use this page whenever a user asks whether MailPilot actually synced the latest Gmail state.",
          ]}
        />

        <SectionCard
          icon={<FiShield className="text-lg" />}
          title="Mail Access Requests"
          purpose="Purpose: This section manages restricted mailbox approval. Admins use it to approve or reject verified mailbox requests."
          steps={[
            "Open the requests page when a user verifies a mailbox and is waiting for approval.",
            "Review the requested mailbox, requester details, and approval state before taking action.",
            "Approve if the verified mailbox should be allowed; reject if it should not be connected.",
          ]}
        />

        <SectionCard
          icon={<FiUsers className="text-lg" />}
          title="Team"
          purpose="Purpose: Team is used to assign ownership and review responsibility for connected mailboxes."
          steps={[
            "Open the mailbox list to see which internal user currently owns each mailbox.",
            "Assign or change the owner when responsibility should move to another team member.",
            "Add reviewers when more than one person should monitor or approve mailbox activity.",
          ]}
        />

        <SectionCard
          icon={<FiCheckCircle className="text-lg" />}
          title="Audit Center"
          purpose="Purpose: Audit Center is the operations history for MailPilot. Use it when you need traceability, review, or issue investigation."
          steps={[
            "Review admin actions, approvals, sync outcomes, replies, and failure events in one timeline.",
            "Use it to confirm who changed something and when the change happened.",
            "Open this page first when the issue is operational rather than message-specific.",
          ]}
        />
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FiMessageCircle className="text-sky-600" />
          <h3 className="text-lg font-semibold text-slate-900">Chatbot guide</h3>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Purpose</p>
            <p className="mt-1 leading-6">
              The chatbot is the fastest way to ask questions, open pages, filter the inbox, create rules, schedule emails, assign owners, approve requests, and perform other supported actions.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">How to use it</p>
            <p className="mt-1 leading-6">
              Ask directly in normal language. If details are missing, MailPilot now asks follow-up questions instead of requiring one strict sentence.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Good examples</p>
            <p className="mt-1 leading-6">
              `show high priority emails`, `what is my reply rate`, `create a rule`, `schedule an email`, `assign an owner`, `show my notifications`.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">When to prefer chatbot</p>
            <p className="mt-1 leading-6">
              Use it when you already know the outcome you want and do not want to navigate through multiple sections manually.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="px-1 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-600">Operational Tips</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">What to check before taking action</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Before syncing</p>
            <p className="mt-1 leading-6">Confirm that the correct mailbox is connected and approved. If not, complete the access flow first.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Before bulk delete or sender cleanup</p>
            <p className="mt-1 leading-6">Check current filters and sender name carefully so you do not remove messages from the wrong inbox scope.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Before creating rules</p>
            <p className="mt-1 leading-6">Start with one narrow rule for one clear pattern. Then sync again and confirm the result before adding more rules.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Before approving requests</p>
            <p className="mt-1 leading-6">Verify the Gmail address, requester, and intended mailbox use so the approval is granted to the correct user.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <FiMessageCircle className="text-sky-600" />
          <h3 className="text-lg font-semibold text-slate-900">Common tasks</h3>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Check whether sync worked</p>
            <p className="mt-1 leading-6">Open Sync History, review the latest run, then return to Overview to confirm inbox counts and pending replies updated correctly.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Create a sender automation</p>
            <p className="mt-1 leading-6">Open Sender Insights, identify a repeat sender pattern, create a rule, then sync again to apply the rule to future fetched messages.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Review finance mail</p>
            <p className="mt-1 leading-6">Open Emails, set the category filter to Finance, review attachments and extracted fields, then reply or schedule follow-up actions.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Investigate a problem</p>
            <p className="mt-1 leading-6">Start with Sync History for technical causes, then use Audit Center for a broader sequence of approvals, sends, and admin changes.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
