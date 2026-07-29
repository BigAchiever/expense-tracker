/**
 * Shown instead of a stack trace when the app is running without Supabase
 * credentials — which is exactly what happens on the very first `npm run dev`.
 */
export function SetupNotice() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">Almost there — one setup step left</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The app can&apos;t reach its database yet. Follow these steps once, then reload this page.
        </p>

        <ol className="mt-5 space-y-4 text-sm text-ink">
          <li>
            <span className="font-semibold">1. Create a free Supabase project</span> at{" "}
            <span className="font-mono text-brand-700">supabase.com</span>.
          </li>
          <li>
            <span className="font-semibold">2. Run the schema.</span> In the Supabase dashboard open{" "}
            <em>SQL Editor → New query</em>, paste the contents of{" "}
            <span className="font-mono text-brand-700">supabase/schema.sql</span>, and run it.
          </li>
          <li>
            <span className="font-semibold">3. Copy your keys.</span> In{" "}
            <em>Project Settings → API</em>, copy the Project URL and the{" "}
            <em>service_role</em> key.
          </li>
          <li>
            <span className="font-semibold">4. Fill in .env.local</span> in the{" "}
            <span className="font-mono text-brand-700">webapp/</span> folder:
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
              {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SESSION_SECRET=<run: openssl rand -base64 32>`}
            </pre>
          </li>
          <li>
            <span className="font-semibold">5. Create the first admin</span> by running{" "}
            <span className="font-mono text-brand-700">npm run create-admin</span> in the{" "}
            <span className="font-mono text-brand-700">webapp/</span> folder.
          </li>
        </ol>

        <p className="mt-5 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-700">
          The <span className="font-mono">service_role</span> key is a master key. Keep it in{" "}
          <span className="font-mono">.env.local</span> and in your hosting provider&apos;s environment
          variables only — never commit it.
        </p>
      </div>
    </main>
  );
}
