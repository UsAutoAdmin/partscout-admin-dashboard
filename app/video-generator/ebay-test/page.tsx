"use client";
import { useState } from "react";

const SAMPLES = [
  { part: "headlight", car: "2018 Honda Civic" },
  { part: "tail light", car: "2015 Toyota Camry" },
  { part: "radio bezel", car: "2012 Chevrolet Silverado" },
  { part: "bumper cover", car: "2019 BMW 3 Series" },
  { part: "fender", car: "2010 Ford F-150" },
  { part: "side mirror", car: "2016 Nissan Altima" },
  { part: "grille", car: "2008 Jeep Wrangler" },
  { part: "AC condenser", car: "2020 Tesla Model 3" },
  { part: "wheel rim", car: "2014 Hyundai Sonata" },
  { part: "door handle", car: "2017 Subaru Outback" },
  { part: "hood", car: "2011 Dodge Ram 1500" },
  { part: "radiator", car: "2013 Mercedes C Class" },
];

interface SoldListing {
  title: string;
  price: string;
  soldDate: string;
}

interface TestResult {
  partImage?: { filename: string; title: string; price: string };
  soldCard?: { filename: string; listingsUsed: SoldListing[] };
  totalListingsFound?: number;
  searchUrl?: string;
  error?: string;
  message?: string;
}

export default function EbayTestPage() {
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [jobId, setJobId] = useState("");

  async function runTest() {
    const sample = SAMPLES[selected];
    const id = `ebay_test_${Date.now()}`;
    setJobId(id);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/video-generator/auto-ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: id,
          partName: sample.part,
          carDescription: sample.car,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  const sample = SAMPLES[selected];

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 32,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        eBay Auto-Overlay Test
      </h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Select a part + car combo and click Test. Uses a real browser to load eBay
        (no raw fetch), just like the scraper.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 15,
          }}
        >
          {SAMPLES.map((s, i) => (
            <option key={i} value={i}>
              {s.car} — {s.part}
            </option>
          ))}
        </select>

        <button
          onClick={runTest}
          disabled={loading}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: loading ? "#999" : "#2563eb",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Loading..." : "Test"}
        </button>

        {result?.searchUrl && (
          <a
            href={result.searchUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#2563eb", fontSize: 13 }}
          >
            View on eBay →
          </a>
        )}
      </div>

      {loading && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "#666",
            background: "#f9fafb",
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 16 }}>
            Loading eBay page for <strong>{sample.car} {sample.part}</strong>...
          </p>
          <p style={{ fontSize: 13, color: "#999" }}>
            Launching browser, navigating to eBay, extracting images...
          </p>
        </div>
      )}

      {result?.error && (
        <div
          style={{
            padding: 20,
            background: "#fef2f2",
            borderRadius: 12,
            color: "#dc2626",
          }}
        >
          Error: {result.error}
        </div>
      )}

      {result?.message && !result.partImage && !result.soldCard && (
        <div
          style={{
            padding: 20,
            background: "#fffbeb",
            borderRadius: 12,
            color: "#92400e",
          }}
        >
          {result.message}
        </div>
      )}

      {result && (result.partImage || result.soldCard) && (
        <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
          <div style={{ flex: "0 0 420" }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#555",
                margin: "0 0 10px",
              }}
            >
              Part Picture
            </h3>
            {result.partImage ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/video-generator/uploads/${jobId}?file=${result.partImage.filename}`}
                  alt={result.partImage.title}
                  style={{
                    width: 400,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: 400,
                  height: 300,
                  background: "#f5f5f5",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999",
                }}
              >
                No part image found
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#555",
                margin: "0 0 10px",
              }}
            >
              Sold Listing Screenshot
            </h3>
            {result.soldCard ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/video-generator/uploads/${jobId}?file=${result.soldCard.filename}`}
                  alt="Sold listings"
                  style={{
                    maxWidth: "100%",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  {result.soldCard.listingsUsed.map((l, li) => (
                    <p
                      key={li}
                      style={{ fontSize: 12, color: "#666", margin: 2 }}
                    >
                      {l.price} — {l.title.slice(0, 70)}... ({l.soldDate})
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  height: 300,
                  background: "#f5f5f5",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999",
                }}
              >
                No sold card generated
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.totalListingsFound != null && (
        <p style={{ marginTop: 16, color: "#888", fontSize: 13 }}>
          {result.totalListingsFound} total listings found on eBay
        </p>
      )}
    </div>
  );
}
