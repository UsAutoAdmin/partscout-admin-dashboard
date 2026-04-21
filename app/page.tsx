export default function Home() {
  return (
    <main>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Part Scout — API</h1>
      <p style={{ color: "#555", maxWidth: "40rem", lineHeight: 1.5 }}>
        This deployment exposes serverless routes (e.g.{" "}
        <code>/api/webhooks/new-member</code> enqueues then triggers processing on Vercel, CRM email
        tracking). Use your local checkout for the full admin dashboard UI if needed.
      </p>
    </main>
  );
}
