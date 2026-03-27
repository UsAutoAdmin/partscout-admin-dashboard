"use client";
import { useState, useEffect } from "react";

const SAMPLE_CARS = [
  "2018 Honda Civic",
  "2015 Toyota Camry",
  "2010 Ford F-150",
  "2019 BMW 3 Series",
  "2005 Buick Enclave",
  "2012 Chevrolet Silverado",
  "2016 Nissan Altima",
  "2008 Jeep Wrangler",
  "2020 Tesla Model 3",
  "2014 Hyundai Sonata",
  "2017 Subaru Outback",
  "2011 Dodge Ram 1500",
  "2013 Mercedes C Class",
  "2009 Volkswagen Jetta",
  "2021 Kia Sorento",
  "2007 Toyota Corolla",
  "2019 Ford Explorer",
  "2006 Honda Accord",
  "2016 Mazda CX-5",
  "2022 Chevrolet Equinox",
  "2010 Audi A4",
  "2015 Lexus RX 350",
  "2018 GMC Sierra",
  "2014 Ford Mustang",
  "2011 Toyota Tacoma",
];

interface CarResult {
  car: string;
  found: boolean;
  sourceUrl?: string;
  searchTerm?: string;
  dimensions?: { width: number; height: number };
  error?: string;
  loading: boolean;
}

export default function CarTestPage() {
  const [results, setResults] = useState<CarResult[]>(
    SAMPLE_CARS.map((car) => ({ car, found: false, loading: true }))
  );

  useEffect(() => {
    async function loadAll() {
      // Process 3 at a time to avoid overwhelming the API
      for (let i = 0; i < SAMPLE_CARS.length; i += 3) {
        const batch = SAMPLE_CARS.slice(i, i + 3);
        await Promise.all(
          batch.map(async (car, offset) => {
            const idx = i + offset;
            try {
              const res = await fetch("/api/video-generator/auto-car-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jobId: "car_test_batch",
                  carDescription: car,
                }),
              });
              const data = await res.json();
              setResults((prev) => {
                const next = [...prev];
                next[idx] = {
                  car,
                  found: data.found ?? false,
                  sourceUrl: data.sourceUrl,
                  searchTerm: data.searchTerm,
                  dimensions: data.dimensions,
                  loading: false,
                };
                return next;
              });
            } catch (err: any) {
              setResults((prev) => {
                const next = [...prev];
                next[idx] = {
                  car,
                  found: false,
                  error: err.message,
                  loading: false,
                };
                return next;
              });
            }
          })
        );
      }
    }
    loadAll();
  }, []);

  const loaded = results.filter((r) => !r.loading).length;
  const found = results.filter((r) => r.found).length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Car Image Test — Wikimedia Commons
      </h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        {loaded}/{SAMPLE_CARS.length} loaded · {found} found · {loaded - found} missing
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320, 1fr))",
          gap: 16,
        }}
      >
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                height: 220,
                background: "#f5f5f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {r.loading ? (
                <span style={{ color: "#999" }}>Loading...</span>
              ) : r.found && r.sourceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.sourceUrl}
                  alt={r.car}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }}
                />
              ) : (
                <span style={{ color: "#c00", fontSize: 14 }}>
                  {r.error ?? "No image found"}
                </span>
              )}
            </div>
            <div style={{ padding: "10px 14px" }}>
              <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{r.car}</p>
              {r.found && (
                <p style={{ color: "#888", fontSize: 12, margin: "4px 0 0" }}>
                  {r.dimensions?.width}×{r.dimensions?.height} · &quot;{r.searchTerm}&quot;
                </p>
              )}
              <span
                style={{
                  display: "inline-block",
                  marginTop: 6,
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: r.loading ? "#eee" : r.found ? "#dcfce7" : "#fee2e2",
                  color: r.loading ? "#888" : r.found ? "#166534" : "#991b1b",
                }}
              >
                {r.loading ? "LOADING" : r.found ? "MATCHED" : "MISS"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
