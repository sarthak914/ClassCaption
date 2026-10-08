export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 640 }}>
      <h1>ClassCaption API</h1>
      <p>Backend for live translated captions, confusion tracking and AI lecture notes.</p>
      <p>
        Check setup at <a href="/api/health">/api/health</a>. The endpoint reference is in <code>API_CONTRACT.md</code> in the repo.
      </p>
    </main>
  );
}
