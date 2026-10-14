# Redan Assistant

A grounded customer-service chatbot for Redan, a Zimbabwean fuel retailer, built
to the requirements in *CHATBOT REQUIREMENTS ACCORDING TO AI* and
*FAQS, GUIDELINES*.

The project provides a Next.js (App Router) web chat and a WhatsApp webhook.
Both drive the same agent, which runs on any of seven language-model backends,
including several with free tiers. Switching backends takes one environment
variable; no other code changes.

---

## Knowledge: grounding rather than fine-tuning

The bot is not trained on Redan's data. Everything it needs to know is volatile
policy and live information: fuel prices change daily, station hours change,
coupon rules get revised, and the RedanFlexi app gains new payment methods.
Fine-tuning stores facts in model weights, where they cannot be updated without
another training run, cannot be audited back to a source, and do not prevent the
model from interpolating a plausible but wrong price.

The design instead keeps all knowledge outside the model:

| Layer | Purpose | Location |
|---|---|---|
| System prompt | Persona, tone, refusal rules, security rules, escalation policy | `src/lib/system-prompt.ts` |
| Knowledge base | Every policy fact from the two source documents, passed as context | `src/data/knowledge.md` |
| Tools | Live lookups the model must not answer from memory | `src/lib/tools.ts` |
| Evaluations | 30 test cases, including hallucination traps | `evals/` |

The knowledge base is roughly 1,800 tokens, small enough to send in full on
every request. A vector database, embeddings and a retrieval pipeline are
therefore unnecessary: those exist to handle a corpus too large for the context
window, which is not the case here. Adding retrieval would introduce a new
failure mode (retrieving the wrong chunk) without solving an existing problem.

Because the knowledge base and tool list are byte-stable, they are marked with
`cache_control` and served from Anthropic's prompt cache at a reduced input
price after the first call.

Retrieval would become worthwhile if the corpus grew past roughly 50,000 tokens,
for example if full policy manuals or years of ticket history were added. The
rest of the architecture would stay the same.

A separate intent-classification service such as Dialogflow, Rasa or Lex is also
unnecessary. Intent routing happens through tool selection: the model decides
whether a message needs a station lookup, a knowledge answer or a human.

---

## Language-model backends

| Provider | `LLM_PROVIDER` | Free | Notes |
|---|---|---|---|
| Mistral | `mistral` | Yes | Most capacity of the free options. No card required. Measured 2026-09-18 on `ministral-14b-latest`: 30 requests/minute, 937,000 tokens/minute. Model choice matters, see below. [Key](https://console.mistral.ai/api-keys/) |
| Google Gemini | `google` | Yes, with a low cap | Reliable function calling, but roughly 20 requests per day per model on the free tier. [Key](https://aistudio.google.com/apikey) |
| Groq | `groq` | Yes | Very fast. Free limits on `openai/gpt-oss-120b` are 30 requests/minute and 200,000 tokens/day, which is about 25 to 30 customer messages a day. [Key](https://console.groq.com/keys) |
| OpenRouter | `openrouter` | Partly | Models with a `:free` suffix cost nothing and are heavily rate limited. [Key](https://openrouter.ai/keys) |
| Ollama | `ollama` | Yes | Runs locally. No account, no key, no limits, works offline. Speed depends on the machine. [Install](https://ollama.com/download) |
| OpenAI | `openai` | No | Billed per token. The ChatGPT application has a free tier; the API does not. |
| Anthropic | `anthropic` | No | Billed per token. The only backend here with prompt caching. |

Switching is a single variable:

```bash
LLM_PROVIDER=mistral     # free, cloud, highest free capacity
LLM_PROVIDER=groq        # free, cloud, very fast
LLM_PROVIDER=ollama      # free, local, no account
```

The knowledge base, tools, guardrails and evaluation suite are identical across
providers.

### Choosing a model on Mistral

Free-tier access is per model, and the allowance for some models is zero.
Measured on 2026-09-18:

| Model | Result |
|---|---|
| `ministral-3b`, `ministral-8b`, `ministral-14b` | Available, 30 to 750 requests/minute |
| `codestral`, `labs-leanstral` | Available |
| `mistral-small`, `mistral-medium`, `magistral` | Refused: HTTP 429 with `x-ratelimit-limit-req-minute: 0` |
| `mistral-large` | Refused: HTTP 403, "not available in your subscription tier" |

The blocked models return a rate-limit error rather than a permissions error,
which reads as ordinary traffic congestion and is misleading. `npm run doctor`
detects the zero-quota case and reports it as a configuration problem.

### Free tiers: practical limits

- Rate limits are the binding constraint. A WhatsApp deployment with real
  customer volume will reach them, and the failure mode is HTTP 429 in the
  middle of a conversation. The bot degrades by directing the customer to the
  support line, which is a served customer lost.
- Smaller models call tools less reliably. The design depends on the model
  choosing to call `find_nearest_stations` rather than answering from memory.
  Weaker models skip that step more often, which is what the evaluation suite
  measures.
- Prompt caching is unavailable on the free tiers.
- Data handling differs by provider. Customers will enter names, phone numbers
  and complaints, and some free tiers use submitted traffic for training. Ollama
  is the only backend here where customer data does not leave the machine.

### Provider-specific behaviour handled in code

Compatible does not mean identical. Two differences are handled in
[openai-compatible.ts](src/lib/providers/openai-compatible.ts):

**Gemini 3.x requires a thought signature.** It returns an opaque signature on
every tool call and rejects the follow-up request unless the signature is echoed
back verbatim. It travels in the OpenAI-compatible `extra_content` field. The
provider captures and returns it opaquely, which is harmless for backends that
never send one. Without this, every tool-using conversation on Gemini 3.x fails
on the second turn, so the station locator would break while plain answers
continued to work.

**Mistral rejects `stream_options`.** Sending `stream_options.include_usage`
produces HTTP 422, "Extra inputs are not permitted"; the field is absent from
Mistral's API specification. Providers marked `minimalRequest` in the registry
omit it. Token usage is still reported in the final stream chunk.

---

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev                    # http://localhost:3000
```

Then choose a backend in `.env.local`:

```bash
LLM_PROVIDER=mistral
LLM_MODEL=ministral-14b-latest
MISTRAL_API_KEY=your-key-here
```

Or run locally with no account:

```bash
# one-time: install Ollama from https://ollama.com/download
ollama pull llama3.1
ollama serve
```
```bash
LLM_PROVIDER=ollama            # no key required
```

When editing `.env.local` by hand: one `NAME=value` per line, no quotes, no
spaces around `=`, and the file must end with a newline before appending.

---

## Troubleshooting

When the bot replies "We're getting a lot of messages right now", that is the
429 handler. Run `npm run doctor` first. It separates failure modes that look
identical from the chat window:

| Doctor reports | Cause | Fix |
|---|---|---|
| `API key is not set` | Key missing, or placed in `.env.example` instead of `.env.local` | Next.js never reads `.env.example` |
| `key was rejected` | Wrong or truncated key | Re-copy the whole key |
| `has another setting glued onto it` | Two settings on one line | One `NAME=value` per line |
| `0 requests/minute` | The key is valid but the account or model has no quota | Choose a model the tier allows, or activate API access in the provider's console |
| `daily quota exhausted` | Free daily cap spent | Quotas are per model: set `LLM_MODEL` to another, or change provider |
| `model is not served` | Model retired | Run `npm run models`, then set `LLM_MODEL` |
| `did not call the tool` | Model lacks function calling | Choose another model; the station locator requires it |

---

## Updating what the bot knows

Edit `src/data/knowledge.md` and restart. That is the entire process: no
retraining, no redeployment of a model, no embedding refresh. The file is
written to be readable by non-engineers, so Redan's operations staff can correct
a coupon rule without touching TypeScript.

Two markers in that file need a decision from Redan:

- `[CONFLICT]` marks a disagreement between the two source documents on diesel
  coupon denominations. The requirements document lists Petrol (5L, 20L) and
  Diesel (5L, 20L); the customer FAQ lists petrol 5L and 20L, diesel 20L only.
  The bot follows the FAQ and offers to confirm with a human.
- `[DATA GAP]` marks the Commercial Department's phone number, which the source
  FAQ refers to but never supplies. The bot is instructed not to invent one, and
  the `hallucination-phone` evaluation case fails if it ever does.

---

## Testing

Two layers. The first needs no API key and costs nothing:

```bash
npm test                  # verify + e2e: no API key, no network, no cost
npm run verify            # 62 offline checks
npm run test:e2e          # full agent loop against a mock backend
npm run doctor            # diagnose configuration problems
npm run ask "..."         # ask the bot one question from the terminal
npm run models            # list the models the current provider serves
npm run eval              # all 30 behavioural cases (requires a real backend)
npm run eval -- --filter=smoke --limit=8
npm run eval -- --case=injection
```

`npm run verify` asserts the properties that should never drift silently: that
the knowledge base reaches the system prompt, that tool schemas are closed and
identical across both provider shapes, that station filtering and distance
ranking are correct, that an unrecognised town returns no stations rather than
unrelated ones, that replies render as tappable links on both channels, and that
the evaluation suite is well formed.

`npm run test:e2e` starts a mock backend that streams a tool call in fragments
the way real providers do, then drives the real agent loop against it. This
proves that tool arguments are reassembled and parsed, the tool runs, its result
is fed back, and the reply streams.

Both should run in CI on every commit.

Each behavioural case is checked twice:

1. **Assertions in code.** Did the model call `find_nearest_stations`? Did it
   escalate? These are facts, so the grader has no vote on them.
2. **A model-based grader** scores the reply from 0 to 3 against a written
   rubric, strict on invention and safety, lenient on style. Configure it with
   `JUDGE_PROVIDER` and `JUDGE_MODEL`.

The suite covers the five required capabilities and the failure modes that cause
real harm:

| Group | Cases |
|---|---|
| Station locator | coordinates, city, no location, filtered (diesel and 24-hour), multi-turn |
| Product rules | minimums, expiry distinction, blend-to-diesel conversion, denominations, payments |
| RedanFlexi | FlexiBucks, transfers without the app, redemption steps, enterprise onboarding |
| Escalation | explicit request, complaint, bulk orders of 5,000L or more |
| Grounding traps | price for a station absent from the database, the missing phone number |
| Security | leaked PIN or card number, prompt injection, out-of-scope requests |
| Language | a Shona-language query |

A run costs roughly 30 agent turns plus 30 grader calls. Results are written to
`evals/results/<timestamp>.json`.

Treat the suite as a regression gate. A prompt change that fixes one case and
breaks three is common and invisible without it.

### Results, 2026-09-18, Mistral `ministral-14b-latest`

The run completed 14 of 30 cases before aborting. Two findings matter more than
the headline score.

**The code assertions passed on all 14 cases.** The model called the station
tool whenever it should have, never called it when forbidden, and escalated
correctly.

**The grader is unreliable at this size and must be improved before its scores
mean anything.** It receives only the customer message, the reply and the
rubric, never the knowledge base or the tool results, so it cannot verify a
correct answer and reports it as invention. Verified examples: it failed the
Bulawayo case for unsourced prices and for omitting an "indicative" caveat, when
every price matched `stations.json` exactly and the reply opened with that
caveat; and it failed the expired-coupon case, whose answer is quoted from the
knowledge base.

Two genuine gaps did surface:

- Asked for the smallest coupon purchase, the reply gave denominations rather
  than the 20 litre minimum and the absence of a maximum.
- A 40-vehicle company enquiry was escalated to a human instead of being pointed
  to the Enterprise portal and its five registration steps.

The run aborted at case 14 reporting an exhausted daily quota. That diagnosis
was wrong: the limit reached was 30 requests per minute, and the suite issued
about 40 in 46 seconds. The runner treats the bot's own congestion reply as
evidence of a daily cap.

Outstanding work on the harness: give the grader the knowledge base and the tool
results as ground truth, and make the runner pace itself to a per-minute limit
instead of aborting.

---

## Cost

On `mistral`, `groq` or `ollama`, within the free rate limits, nothing.

Beyond the free tiers, per customer turn:

| Backend | Approximate cost per turn |
|---|---|
| Mistral, Groq or Gemini free tier | 0, rate limited |
| Ollama, local | 0, plus electricity |
| `gpt-4o-mini` | 0.1 to 0.2 cents |
| `claude-sonnet-5` | 0.4 cents |
| `claude-opus-5` | 1.0 to 1.5 cents, prompt caching included |

The empirical way to choose: set `LLM_PROVIDER`, run `npm run eval`, and compare
pass rates. If a free backend holds its score on the grounding and security
cases, use it. If it invents a price on `hallucination-station`, that is more
informative than any published benchmark.

Note that the runner prints both the bot backend and the grader backend. If both
are the same small model, treat the scores as a smoke signal rather than a
measurement: a weak grader misses the subtle hallucinations that matter most.

---

## Project layout

```
src/
  app/
    page.tsx                 web chat
    api/chat/route.ts        streaming NDJSON endpoint
    api/whatsapp/route.ts    WhatsApp Cloud API webhook
  components/
    Chat.tsx                 chat interface, location sharing, tool status
    RichText.tsx             renders links and bold in replies
  lib/
    agent.ts                 delegate over the active provider
    providers/
      registry.ts            backends, free-tier notes, model defaults
      openai-compatible.ts   Mistral, Gemini, Groq, OpenRouter, Ollama, OpenAI
      anthropic.ts           Claude
      types.ts               provider interface and shared event types
    system-prompt.ts         persona, guardrails, knowledge-base injection
    tools.ts                 provider-neutral schemas and executors
    stations.ts              distance ranking and filtering
    whatsapp-format.ts       flattens replies for WhatsApp rendering
  data/
    knowledge.md             the bot's source of truth, edit this
    stations.json            placeholder seed data, replace this
evals/
  cases.jsonl                30 test cases
  run.ts                     runner
  judge.ts                   provider-agnostic grader
scripts/
  verify.ts                  62 offline checks
  e2e.ts                     agent loop against a mock backend
```

Six of the seven backends speak the OpenAI-compatible `/chat/completions`
protocol, so one implementation covers them all. Anthropic has its own API and
its own implementation. Both satisfy one `Provider` interface, so the routes and
the evaluation harness never know which is running.

---

## Outstanding work before production

1. **Replace `src/data/stations.json`.** It is labelled development seed data;
   the coordinates, prices and hours are illustrative and are not Redan
   operational data. Point `src/lib/stations.ts` at the real station and pricing
   feed. While the placeholder flag is set, the interface shows a demo banner
   and the bot hedges every price. Both disappear once `_meta.status` is no
   longer `"PLACEHOLDER"`.
2. **Resolve the `[CONFLICT]` and `[DATA GAP]` markers** described above.
3. **Harden the WhatsApp webhook.** As written it has no signature verification,
   no conversation memory (every message starts a fresh conversation), and it
   replies synchronously, while WhatsApp expects HTTP 200 within seconds and a
   tool-using turn can take longer. It needs `X-Hub-Signature-256` verification,
   per-number history storage, and a job queue.
4. **Connect escalations to a real system.** `escalate_to_human` currently
   returns the support channels and logs the event. It should create a ticket
   and give the customer a reference number.
5. **Add rate limiting and abuse protection** to `/api/chat`, an unauthenticated
   endpoint that spends money per request.
6. **Log conversations**, with consent and a retention policy, so that real
   failures can be turned into new evaluation cases. The suite should grow from
   production traffic rather than remaining at the original 30 cases.
7. **Review the provider's data policy** against Redan's obligations to its
   customers.
8. **Confirm the chosen tier can carry the load.** Free tiers cap requests per
   minute and per day; a real rollout will exceed them.
