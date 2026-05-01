import { useState } from "react";

type ManualProcessFormProps = {
  submitting: boolean;
  onSubmit: (payload: { subject: string; from: string; body: string }) => Promise<void>;
};

export function ManualProcessForm({ submitting, onSubmit }: ManualProcessFormProps) {
  const [form, setForm] = useState({
    subject: "",
    from: "",
    body: "",
  });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(form);
        setForm({ subject: "", from: "", body: "" });
      }}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4"
    >
      {/* 🔹 Header */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          Manual Processing
        </p>
        <h2 className="text-lg font-semibold text-gray-900">
          Email Workflow
        </h2>
      </div>

      {/* 🔹 Inputs */}
      <div className="grid md:grid-cols-2 gap-4">
        
        {/* Subject */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Subject</label>
          <input
            required
            value={form.subject}
            onChange={(e) =>
              setForm((c) => ({ ...c, subject: e.target.value }))
            }
            className="px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white transition-all duration-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 hover:border-gray-400"
            placeholder="Enter email subject"
          />
        </div>

        {/* From */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">From</label>
          <input
            required
            type="email"
            value={form.from}
            onChange={(e) =>
              setForm((c) => ({ ...c, from: e.target.value }))
            }
            className="px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white transition-all duration-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 hover:border-gray-400"
            placeholder="sender@example.com"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Body</label>
        <textarea
          required
          rows={6}
          value={form.body}
          onChange={(e) =>
            setForm((c) => ({ ...c, body: e.target.value }))
          }
          className="px-4 py-3 border border-gray-300 rounded-lg text-sm bg-white resize-none transition-all duration-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 hover:border-gray-400"
          placeholder="Paste email content here..."
        />
      </div>

      {/* 🔹 Submit */}
      <div className="flex justify-end">
        <button
          disabled={submitting}
          type="submit"
          className="
            px-4 py-2 rounded-lg text-sm font-medium
            bg-blue-600 text-white hover:bg-blue-700
            transition
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {submitting ? "Processing..." : "Process Email"}
        </button>
      </div>
    </form>
  );
}