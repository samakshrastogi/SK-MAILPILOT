import { useState } from "react";
import { FiKey, FiLogIn, FiMail, FiShield, FiUser } from "react-icons/fi";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-.8 2.4-1.7 3.2l2.8 2.2c1.6-1.5 2.6-3.8 2.6-6.5 0-.6-.1-1.2-.2-1.8H12z"
      />
      <path
        fill="#4285F4"
        d="M12 22c2.4 0 4.5-.8 6-2.3l-2.8-2.2c-.8.5-1.8.9-3.2.9-2.4 0-4.5-1.6-5.2-3.9l-2.9 2.2C5.4 19.8 8.4 22 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.8 14.5c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7L3.9 8.9C3.3 10 3 11.2 3 12.8s.3 2.8.9 3.9l2.9-2.2z"
      />
      <path
        fill="#34A853"
        d="M12 7.2c1.3 0 2.5.4 3.4 1.3l2.5-2.5C16.5 4.7 14.4 4 12 4 8.4 4 5.4 6.2 3.9 9.3l2.9 2.2C7.5 8.8 9.6 7.2 12 7.2z"
      />
    </svg>
  );
}

type AuthPageProps = {
  loading: boolean;
  error: string | null;
  pendingVerificationEmail: string | null;
  pendingPasswordResetEmail: string | null;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: { name: string; email: string; password: string }) => Promise<void>;
  onForgotPassword: (payload: { email: string }) => Promise<void>;
  onVerifyOtp: (payload: { email: string; otp: string }) => Promise<void>;
  onResendOtp: (payload: { email: string }) => Promise<void>;
  onResetPassword: (payload: { email: string; otp: string; newPassword: string }) => Promise<void>;
  onResendPasswordResetOtp: (payload: { email: string }) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
};

export function AuthPage({
  loading,
  error,
  pendingVerificationEmail,
  pendingPasswordResetEmail,
  onLogin,
  onRegister,
  onForgotPassword,
  onVerifyOtp,
  onResendOtp,
  onResetPassword,
  onResendPasswordResetOtp,
  onGoogleLogin,
}: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    newPassword: "",
    otp: "",
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_30%),linear-gradient(180deg,_#f7fbff_0%,_#eaf1ff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 backdrop-blur">
            MailPilot Access
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            One inbox workspace for password login, Google SSO, OTP verification and Gmail automation.
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            Existing password users can also continue with Google SSO on the same email. Verified sessions unlock the full dashboard, inbox sync and compose tools.
          </p>
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">Password and Google login on one account</div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">OTP verification before sensitive access</div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">Responsive inbox and compose workspace</div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6">
          {pendingVerificationEmail ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-sky-600 p-2 text-white">
                    <FiShield />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Verify your email</p>
                    <p className="mt-1 text-sm text-slate-600">
                      We sent a 6-digit OTP to <strong>{pendingVerificationEmail}</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await onVerifyOtp({ email: pendingVerificationEmail, otp: form.otp });
                }}
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">OTP</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <FiShield className="text-slate-400" />
                    <input
                      value={form.otp}
                      onChange={(event) => setForm((current) => ({ ...current, otp: event.target.value }))}
                      className="w-full bg-transparent outline-none tracking-[0.35em]"
                      placeholder="123456"
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      required
                    />
                  </div>
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FiLogIn />
                    Verify and login
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void onResendOtp({ email: pendingVerificationEmail })}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Resend OTP
                  </button>
                </div>
              </form>
            </div>
          ) : pendingPasswordResetEmail ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-500 p-2 text-white">
                    <FiShield />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Reset your password</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Enter the OTP sent to <strong>{pendingPasswordResetEmail}</strong> and choose a new password.
                    </p>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await onResetPassword({
                    email: pendingPasswordResetEmail,
                    otp: form.otp,
                    newPassword: form.newPassword,
                  });
                }}
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">OTP</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <FiShield className="text-slate-400" />
                    <input
                      value={form.otp}
                      onChange={(event) => setForm((current) => ({ ...current, otp: event.target.value }))}
                      className="w-full bg-transparent outline-none tracking-[0.35em]"
                      placeholder="123456"
                      inputMode="numeric"
                      minLength={6}
                      maxLength={6}
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <FiKey className="text-slate-400" />
                    <input
                      type="password"
                      value={form.newPassword}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, newPassword: event.target.value }))
                      }
                      className="w-full bg-transparent outline-none"
                      placeholder="Choose a new password"
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FiLogIn />
                    Reset and login
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void onResendPasswordResetOtp({ email: pendingPasswordResetEmail })}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Resend OTP
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="mb-5 flex gap-2 rounded-2xl bg-slate-100 p-1">
                {(["login", "register", "forgot"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium capitalize transition ${
                      mode === item ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void onGoogleLogin()}
                className="mb-4 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                <GoogleLogo />
                Continue with Google SSO
              </button>

              {error ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (mode === "login") {
                    await onLogin({ email: form.email, password: form.password });
                  } else if (mode === "register") {
                    await onRegister({ name: form.name, email: form.email, password: form.password });
                  } else {
                    await onForgotPassword({ email: form.email });
                  }
                }}
              >
                {mode === "register" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Name</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <FiUser className="text-slate-400" />
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full bg-transparent outline-none"
                        placeholder="Your name"
                        minLength={2}
                        required
                      />
                    </div>
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <FiMail className="text-slate-400" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full bg-transparent outline-none"
                      placeholder="name@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>

                {mode !== "forgot" ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <FiKey className="text-slate-400" />
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                        className="w-full bg-transparent outline-none"
                        placeholder="••••••••"
                        minLength={8}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        required
                      />
                    </div>
                  </label>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiLogIn />
                  {mode === "login" ? "Login" : mode === "register" ? "Create account" : "Send reset OTP"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
