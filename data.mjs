// Deterministic reconciliation batches: invoices plus bank lines with typos and small amount drift.
const NAMES = ["Acme Supplies Inc", "Northwind Traders", "Globex Corporation", "Initech LLC", "Umbrella Logistics",
  "Stark Industrial Co", "Wayne Enterprises", "Hooli Cloud Ltd", "Vandelay Imports", "Soylent Foods GmbH"];

export function makeBatch(index, n) {
  let seed = 1000 + index;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const typo = (s) => { const i = Math.floor(rnd() * s.length); return rnd() < 0.5 ? s.slice(0, i) + s.slice(i + 1) : s.slice(0, i) + "x" + s.slice(i); };
  const invoices = [], bank = [];
  for (let i = 0; i < n; i++) {
    const vendor = NAMES[Math.floor(rnd() * NAMES.length)] + " " + Math.floor(rnd() * 40);
    const amount = Math.round(rnd() * 900000) / 100 + 10;
    invoices.push({ id: `INV-${index}-${i}`, vendor, amount });
    const r = rnd();
    if (r < 0.6) bank.push({ ref: `B${index}-${i}`, payee: vendor, amount });
    else if (r < 0.9) bank.push({ ref: `B${index}-${i}`, payee: typo(vendor.toUpperCase()), amount: Math.round(amount * (1 + (rnd() - 0.5) * 0.01) * 100) / 100 });
    else bank.push({ ref: `B${index}-${i}`, payee: "Unknown Payee " + i, amount: Math.round(rnd() * 5000) / 100 });
  }
  return JSON.stringify({ invoices, bank });
}
