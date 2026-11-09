Write one TypeScript file that exports `function run(input: string): string`. It runs inside a code-mode sandbox.

Task: reconcile bank transactions against open invoices.
- `input` is JSON: `{"invoices":[{"id":string,"vendor":string,"amount":number}], "bank":[{"ref":string,"payee":string,"amount":number}]}`
- Normalize names: lowercase, drop characters other than a-z, 0-9 and spaces, drop the words inc, llc, ltd, gmbh, co, trim.
- For each bank line, consider unused invoices whose amount is within 1% of the bank amount. Score each candidate as
  levenshtein(normalized vendor, normalized payee) * 1000 + |amount difference|. Take the lowest score (first one on ties).
  If the best score is below 4000, mark that invoice used and count the line as `matched` when the score is below 1,
  otherwise `fuzzy`. If there is no such candidate, count it `unmatched` and add its amount to `unmatchedTotal`.
- Return `JSON.stringify({ matched, fuzzy, unmatched, unmatchedTotal })` with unmatchedTotal rounded to cents
  (`Math.round(x * 100) / 100`).

Constraints (the file is compiled ahead of time by a strict TypeScript compiler):
- Declare interfaces for the input and cast the parsed JSON to them; no `any`, no classes, no generics, no regex lookbehind.
- Plain functions, `for` loops and arrays; implement Levenshtein yourself with two rows of numbers.
- No imports, no I/O, no globals other than JSON and Math.

Reply with the file in a single ```ts block and nothing else.
