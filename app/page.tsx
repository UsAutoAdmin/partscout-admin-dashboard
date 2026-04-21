export default function Home() {
  return (
    <main>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Part Scout — API</h1>
      <p style={{ color: "#555", maxWidth: "40rem", lineHeight: 1.5 }}>
        This deployment exposes serverless routes (e.g.{" "}
        <code>/api/webhooks/new-member</code> builds the pick sheet on Vercel; Gmail send runs on your
        machine via <code>/api/internal/pick-sheet-email-from-run</code> with local <code>GOOGLE_*</code>).
        CRM tracking routes are here too.
      </p>
    </main>
  );
}
