export default function Home() {
  return (
    <main className="sheno-bg-base">
      <h1>ShenoStore</h1>
      <p>Storefront for ShenoDev tenants.</p>
      {/* Styles come from @shenodev/ui, not from markup defined here. */}
      <button type="button" className="sheno-btn">
        Browse catalogue
      </button>
    </main>
  );
}