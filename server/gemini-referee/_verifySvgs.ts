import { getAllObjects } from "./objectPool.js";

async function main() {
  const all = getAllObjects();
  const campus = all.filter((o) => o.category === "HACKATHON_CAMPUS");
  const household = all.filter((o) => o.category === "HOUSEHOLD");
  console.log(
    JSON.stringify(
      {
        total: all.length,
        campus: campus.length,
        household: household.length,
        uniqueIds: new Set(all.map((o) => o.id)).size,
      },
      null,
      2,
    ),
  );

  const results = [];
  const batchSize = 10;
  for (let i = 0; i < all.length; i += batchSize) {
    const slice = all.slice(i, i + batchSize);
    const batch = await Promise.all(
      slice.map(async (o) => {
        const res = await fetch(o.flatSvgUrl);
        const ct = res.headers.get("content-type") || "";
        const text = await res.text();
        const ok = res.ok && /svg/i.test(ct + text) && text.includes("<svg");
        return { id: o.id, url: o.flatSvgUrl, status: res.status, ct, ok, len: text.length };
      }),
    );
    results.push(...batch);
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`svg_ok ${results.length - bad.length} svg_bad ${bad.length}`);
  if (bad.length) console.log(JSON.stringify(bad, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
