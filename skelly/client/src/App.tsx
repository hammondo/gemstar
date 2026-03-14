import { useEffect, useState } from "react";
import {
  getHealth,
  getSampleData,
  type HealthResponse,
  type SampleResponse,
} from "./api/appApi";
import "./App.css";

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sample, setSample] = useState<SampleResponse | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [healthResult, sampleResult] = await Promise.all([
          getHealth(),
          getSampleData(),
        ]);
        setHealth(healthResult);
        setSample(sampleResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <main className="app-shell">
      <h1>Skelly Frontend</h1>
      <p className="subtitle">
        React + Vite + TypeScript consuming Express API
      </p>

      {loading && <p>Loading API data...</p>}
      {error && <p className="error">Failed to load API data: {error}</p>}

      {!loading && !error && health && sample && (
        <section className="panel">
          <h2>API Status</h2>
          <p>
            <strong>Status:</strong> {health.status}
          </p>
          <p>
            <strong>Service:</strong> {health.service}
          </p>
          <p>
            <strong>Timestamp:</strong> {health.timestamp}
          </p>

          <h2>Sample Data</h2>
          <ul>
            {sample.items.map((item) => (
              <li key={item.id}>
                {item.id} - {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default App;
