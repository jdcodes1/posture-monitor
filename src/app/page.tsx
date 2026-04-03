import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0e14] text-[#c8cfd8]">
      <div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
        {/* Hero */}
        <section className="text-center">
          <h1 className="font-mono text-4xl sm:text-5xl font-bold tracking-tight text-white">
            posture//watch
          </h1>
          <p className="mt-4 text-lg text-[#5c6370]">
            Your posture, monitored. Nothing leaves your browser.
          </p>
          <Link
            href="/monitor"
            className="mt-8 inline-block rounded-lg bg-[#3ee8a5] px-6 py-3 font-semibold text-[#0b0e14] transition hover:brightness-110"
          >
            Try it free &rarr;
          </Link>
        </section>

        {/* Features */}
        <section className="mt-24 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-[#3ee8a5]">
              Privacy-first
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c6370]">
              All processing stays on your device. No video uploaded. Ever.
            </p>
          </div>

          <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-[#4a9eff]">
              Battery-efficient
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c6370]">
              Camera activates for milliseconds, then sleeps. Runs all day.
            </p>
          </div>

          <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
              Free
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c6370]">
              No account needed. Sign up only to save your history.
            </p>
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="mt-16 text-center">
          <p className="text-sm text-[#5c6370]">
            Sign up to save your stats across devices
          </p>
          <Link
            href="/sign-up"
            className="mt-3 inline-block text-sm font-medium text-[#4a9eff] underline underline-offset-4 transition hover:text-[#3ee8a5]"
          >
            Create an account
          </Link>
        </section>
      </div>
    </main>
  );
}
