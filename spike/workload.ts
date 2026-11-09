// A typical code-mode script: reconcile bank transactions against open invoices.
// Exact amount match first, then fuzzy vendor-name match (edit distance) within 1% of the amount.
// input: JSON {"invoices":[{id,vendor,amount}], "bank":[{ref,payee,amount}]}
// output: JSON {matched, fuzzy, unmatched, unmatchedTotal}

interface Invoice { id: string; vendor: string; amount: number }
interface BankLine { ref: string; payee: string; amount: number }
interface Batch { invoices: Invoice[]; bank: BankLine[] }

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\b(inc|llc|ltd|gmbh|co)\b/g, "").trim();
}

function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1, ins = cur[j - 1] + 1, sub = prev[j - 1] + cost;
      cur.push(del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub));
    }
    prev = cur;
  }
  return prev[n];
}

export function run(input: string): string {
  const batch = JSON.parse(input) as Batch;
  const open: Invoice[] = batch.invoices.slice();
  const vendors: string[] = open.map((x) => norm(x.vendor));
  const used: boolean[] = open.map(() => false);
  let matched = 0, fuzzy = 0, unmatched = 0, unmatchedTotal = 0;
  for (const line of batch.bank) {
    const payee = norm(line.payee);
    let best = -1, bestScore = 1e9;
    for (let k = 0; k < open.length; k++) {
      if (used[k]) continue;
      const diff = Math.abs(open[k].amount - line.amount);
      if (diff > open[k].amount * 0.01) continue;
      const d = vendors[k] === payee ? 0 : distance(vendors[k], payee);
      const score = d * 1000 + diff;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    if (best >= 0 && bestScore < 4000) {
      used[best] = true;
      if (bestScore < 1) matched++; else fuzzy++;
    } else {
      unmatched++;
      unmatchedTotal += line.amount;
    }
  }
  return JSON.stringify({ matched: matched, fuzzy: fuzzy, unmatched: unmatched, unmatchedTotal: Math.round(unmatchedTotal * 100) / 100 });
}
