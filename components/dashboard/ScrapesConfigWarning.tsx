export default function ScrapesConfigWarning({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">Scrapes config warning</div>
      <h3 className="mt-2 text-lg font-semibold">Supabase is not configured for this dashboard runtime.</h3>
      <p className="mt-2 text-sm leading-6">{message}</p>
      <div className="mt-4 text-sm leading-6">
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to the environment used by this dashboard.
      </div>
    </div>
  );
}
