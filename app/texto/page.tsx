export default function TextoRedirect() {
  return <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
    <meta httpEquiv="refresh" content="0;url=/text" />
    <link rel="canonical" href="/text" />
    <p>Esta rota mudou para <a href="/text">/text</a>.</p>
  </main>;
}
