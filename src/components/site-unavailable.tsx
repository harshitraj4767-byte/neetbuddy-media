export function SiteUnavailable() {
  return (
    <main className="unavailable-page">
      <section className="unavailable-content" aria-labelledby="unavailable-title">
        <svg
          className="unavailable-icon"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path d="M8.5 3.5h20l11 11v30H8.5z" />
          <path d="M28.5 3.5v11h11" />
          <path d="M17 27h2.5m9.5 0h2.5M18 36c3.5-4 8.5-4 12 0" />
        </svg>

        <h1 id="unavailable-title">This site can’t be reached</h1>
        <p>Check if there is a typo in the web address.</p>
        <p className="unavailable-code">DNS_PROBE_FINISHED_NXDOMAIN</p>
      </section>
    </main>
  );
}