# Bulk Question JSON — canonical format (v2)

The bulk importer accepts a **single question object** or an **array of question objects**. All strings **must** be double-quoted. All base64 payloads **must** be inlined on a single line with the correct MIME prefix.

---

## 1. Minimal shape (per question)

```json
{
  "subject": "Biology",
  "chapter": "Molecular Basis of Inheritance",
  "topic": "Nitrogenous Bases",
  "sub_topic": "Uracil",
  "text": "Which of the following diagrams represents Uracil (U)?",
  "options": [
    "![diagram](data:image/jpeg;base64,/9j/4AAQSkZJRg...)",
    "![diagram](data:image/jpeg;base64,/9j/4AAQSkZJRg...)",
    "Cytosine",
    "Adenine"
  ],
  "correct_index": 0,
  "explanation": "Uracil is a pyrimidine found only in RNA.",
  "difficulty": "easy",
  "source": "NCERT Class XII Biology",
  "marks_correct": 4,
  "marks_wrong": -1,
  "is_pyq": false,
  "pyq_year": null,
  "question_type": "diagram_options"
}
```

---

## 2. Field rules

| Field | Type | Rule |
|---|---|---|
| `subject` | string | Required. One of `Physics`, `Chemistry`, `Botany`, `Zoology`, `Biology` |
| `chapter` | string | Required. Auto-created if missing |
| `topic`, `sub_topic` | string \| null | Optional |
| `text` | string | Required. **Must be double-quoted.** Use `\n` (not real newlines) inside |
| `options` | array of **exactly 4** strings | Required |
| `correct_index` | integer 0–3 | Required |
| `explanation` | string \| null | **Must be double-quoted** if present |
| `difficulty` | `easy` \| `medium` \| `hard` | Default `medium` |
| `source` | string | Default `NCERT` |
| `marks_correct` / `marks_wrong` | number | Default `4` / `-1` |
| `is_pyq` | boolean | Default `false` |
| `pyq_year` | number \| null | Only when `is_pyq` |
| `question_type` | `standard` \| `diagram` \| `diagram_options` | Auto-inferred if omitted |

---

## 3. Diagram / image syntax — **ONE valid form**

```
![alt text](data:image/jpeg;base64,<BASE64_ONE_LINE>)
```

or `data:image/png;base64,...` for PNGs.

Rules the parser will reject:
- ❌ `[diagram](...)` — missing `!` prefix (this is a plain link, not an image)
- ❌ `![diagram](9j/...)` — missing `data:image/jpeg;base64,` prefix AND missing leading `/`
- ❌ `![diagram](diagram/somefile.png)` — relative filesystem paths (files not uploaded to the DB)
- ❌ Real newlines / spaces / tabs inside the base64 payload
- ❌ Missing closing `"` on the string containing the markdown image

Do NOT embed the same diagram twice (as `[diagram]` token AND as `![diagram](url)`). The renderer replaces `[diagram N]` tokens with a URL, but tokens inside an already-embedded `![...](...)` are now left alone.

---

## 4. Errors your last two files hit

### `Q15_1.json`
1. Missing opening `"` on `text`: `"text": \n\nWhich...?"` → must be `"text": "\n\nWhich...?"`
2. Missing closing `"` and missing comma between option images
3. Raw newlines inside a base64 payload — base64 must be one continuous string

### `Q16.json`
1. `"text":[diagram](9j/...)` — three bugs at once:
   - Missing opening `"` on the value
   - Missing `!` prefix (would be a link, not an image)
   - Missing `data:image/jpeg;base64,` prefix and leading `/`
2. `"explanation": Hint...\n...` — missing opening `"`
3. Options like `"![diagram](diagram/series_combination_correct.png)"` — reference filesystem paths that don't exist. Every option image must be an inline `data:image/...;base64,...` payload.

The importer is tolerant of the string-quoting mistakes (auto-quotes known keys, injects missing commas), but garbage payload paths cannot be rescued — the image data is not in the file.

---

## 5. MASTER PROMPT (copy-paste into any LLM)

> You are producing **NEET-UG diagram-based MCQs as strict JSON**. Output **only** a JSON array — no prose, no markdown fences, no comments.
>
> ### Shape
> Each element MUST be an object with **exactly** these keys:
> `subject`, `chapter`, `topic`, `sub_topic`, `text`, `options`, `correct_index`, `explanation`, `difficulty`, `source`, `marks_correct`, `marks_wrong`, `is_pyq`, `pyq_year`, `question_type`.
>
> ### Hard rules
> 1. Every string MUST be wrapped in double quotes `"..."`. Never omit the opening or closing quote.
> 2. Use `\n` (backslash-n) for line breaks inside strings. **Never** put a real newline inside a string literal.
> 3. `options` MUST be an array of **exactly 4 strings**, comma-separated. `correct_index` is `0`, `1`, `2`, or `3`.
> 4. Diagrams — the **only** legal form (anywhere in `text` or in any of the 4 `options`) is:
>    ```
>    "![alt](data:image/jpeg;base64,BASE64_ONE_LINE)"
>    ```
>    or `data:image/png;base64,...` for PNGs. The base64 must have **no whitespace, no newlines, no line breaks** — one continuous string.
> 5. **Never** use `[diagram](...)` without the leading `!` — that is a plain link and the renderer will not display it as an image.
> 6. **Never** use file paths like `diagram/foo.png` or `/assets/x.jpg`. Every image must be inline base64. If you don't have base64 data, don't emit that question.
> 7. **Never** include real characters like tab, CR, or LF inside a JSON string — escape them as `\t`, `\r`, `\n`.
> 8. LaTeX: inline `$...$`, block `$$...$$`. Escape backslashes only when JSON requires it: `\\frac`, `\\vec`.
> 9. `difficulty` ∈ `easy|medium|hard`. `source` is a free string (e.g. `"NCERT Class XII Biology"`, `"PYQ 2024"`).
> 10. If `is_pyq: true`, set `pyq_year` to the year. Otherwise both `is_pyq: false` and `pyq_year: null`.
> 11. `question_type` = `"diagram_options"` if ANY of the 4 options is a markdown image, `"diagram"` if only `text` has an image, else `"standard"`.
> 12. NO trailing commas. NO comments. NO markdown code fences around the JSON. NO leading/trailing prose.
>
> ### Self-check before you output
> Before emitting the array, mentally verify:
> - [ ] Every `"..."` string has a matching opening AND closing quote
> - [ ] Every image is `![alt](data:image/<png|jpeg>;base64,...)` — no other form
> - [ ] Every base64 body is one line (no whitespace inside the parentheses)
> - [ ] `options.length === 4`
> - [ ] `correct_index` is 0/1/2/3
> - [ ] The whole output parses as JSON
>
> Return ONLY the JSON array.

---

## 6. Cloudflare Worker environment variables

Add these under **Workers & Pages → your project → Settings → Variables and Secrets** (mark all as **Secret** except the two public ones):

**Required — external Supabase**
- `EXT_SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `EXT_SUPABASE_PUBLISHABLE_KEY` (public, non-secret)
- `EXT_SUPABASE_SERVICE_ROLE_KEY` (secret)
- `EXT_SUPABASE_PROJECT_ID`
- `EXT_SUPABASE_DB_URL` (secret) — `postgresql://...`
- `EXT_SUPABASE_ACCESS_TOKEN` (secret)

**Required — Lovable AI Gateway**
- `LOVABLE_API_KEY` (secret)

**Required — cron authentication**
- `CRON_SECRET` (secret) — any long random string; sent in the `x-cron-secret` header

**Optional (enable when the feature is used)**
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LOGIN_SECRET`
- `RESEND_API_KEY` (transactional email)

Public-in-bundle (already read via `import.meta.env.VITE_*` at build time — same values as `EXT_SUPABASE_URL` / `EXT_SUPABASE_PUBLISHABLE_KEY`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`vite.config.ts` already falls back to the `EXT_*` variants at build time, so setting the `EXT_*` values on Cloudflare is enough.
