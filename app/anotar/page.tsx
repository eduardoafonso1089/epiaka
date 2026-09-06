export default function AnotarRedirect() {
  return <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
    <meta httpEquiv="refresh" content="0;url=/annotate" />
    <link rel="canonical" href="/annotate" />
    <p>Esta rota mudou para <a href="/annotate">/annotate</a>.</p>
  </main>;
}
