export default function Home() {
  return (
    <main className="min-h-screen bg-sheno-bg-base p-8 text-sheno-text-primary">
      <h1 className="text-3xl font-semibold">ShenoStore</h1>
      <p className="text-sheno-text-secondary">Storefront for ShenoDev tenants.</p>
      {/* Primary action: solid cyan fill with dark text, per UI_UX_Brief.md §4.
          ShenoStore keeps the #22d3ee primary — the #06B6D4 shift is ShenoFlow
          only, so a primary button never reads as an "Out for Delivery" chip. */}
      <button
        type="button"
        data-testid="primary-action"
        className="mt-6 rounded-lg border border-transparent bg-sheno-primary px-5 py-2.5 font-semibold text-sheno-bg-base hover:bg-sheno-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sheno-focus-ring"
      >
        Browse catalogue
      </button>
    </main>
  );
}