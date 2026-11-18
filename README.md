# BROWNOUT

Seeded network storms for a local web app: Kane CLI drives a real browser through your user flow while a proxy breaks
the network on exact call numbers. When Kane sees the user hurt, a coding agent (Claude Code) patches the app and Kane runs again.

Demo video (1:57): https://youtu.be/cgvqlY3akaQ

## The 20-second version
Storm "lost-response": `POST /api/pay` reaches the shop, the shop saves the order, and the proxy drops the answer.
The user clicks "Pay now" again. In the demo shop this happened (from `evidence/s2-clean/` of the real run below):

- Kane (browser): red, `Checkpoint assertion failed: "Verify the page shows exactly the text 'Orders: 1'"`
- The app itself, asked by a `verify` command after the run: `app holds 2 order(s), expected 1`. That is a double charge, and it is
  proven without trusting Kane.
- Claude Code reads Kane's words plus the proxy's fault log and edits `server.mjs`. Kane runs again: green, the app holds 1 order.

## Install and run
Needs Node 20+, [Kane CLI](https://www.npmjs.com/package/@testmuai/kane-cli) logged in (`kane-cli login`; it is a dependency, a
global install also works), and Claude Code (`claude`) for the fixing agent.

    npx github:Kylne700/brownout demo --only lost-response --no-baseline --no-final   # one storm, about 2-3 Kane runs
    npx github:Kylne700/brownout demo --reset                                         # all 5 storms, the full run

Kane signup is free at testmuai.com (the free credits cover a full demo). To see the app headed in a visible browser, set `BROWNOUT_HEADED=1`.

`demo` copies the naive shop to `./brownout-demo-shop` (the agent edits that copy, never the package) and writes
`./runs/<time>/REPORT.md`, `report.html`, `result.json`. Kane traffic goes through `mullvad-exclude` when that binary exists
(`--no-mullvad` turns it off). Exit code 0 means every storm ended green.

Your own app:

    npx github:Kylne700/brownout run --app "npm start" --app-dir . --flows flows/ --storms storms.json --baseline --final

Ports: the proxy listens on `--port` (default 18750), your app must listen on `--app-port` (default 18751, passed as `PORT`).

## A storm spec and a flow
`storms.json`:

    [{ "name": "lost-response",
       "flow": "lost-response.txt",
       "expect": "A retry must never create a second order. ... The orders page must show exactly \"Orders: 1\".",
       "faults": [{ "route": "/api/pay", "method": "POST", "calls": "1", "action": "drop-after-upstream" }],
       "verify": "node verify/orders.mjs 1" }]

- `calls`: `"1"`, `"1-2"` or `"all"`: the fault hits the Nth request to that route, so a red is reproducible.
- `action`: `status:503`, `drop-after-upstream` (app processes the request, the browser never gets the answer), `delay:12000`, `body:html-error`.
- `expect`: the rule, in words. It goes into the agent prompt.
- `verify` (optional): a shell command run in the storms file's folder after Kane, while the app is still up. Exit 0 = the app state
  is right. It gets `BROWNOUT_APP_URL` (the app itself, no proxy) and `BROWNOUT_STORM`. A storm is green only when Kane and verify agree;
  when they disagree the report says `DISAGREES with Kane`.

A flow is plain English for Kane, `{{BASE}}` is the proxy URL (`demo/flows/lost-response.txt`):

    Navigate to {{BASE}} then click the button 'Add mug to cart', type '123 Main St' in the 'Shipping address' field,
    click 'Continue', click 'Pay now' and wait up to 20 seconds. If the page shows an error message instead of
    'Order confirmed', click 'Pay now' one more time ... Then navigate to {{BASE}}/orders and verify the page shows
    exactly the text 'Orders: 1'.

## How it works
1. Storm: start the app and a fresh proxy (call counters at 0) with only this storm's faults.
2. Kane: `kane-cli run` the flow in a real browser through the proxy. Verdict, reason and steps come from its NDJSON stream.
3. Evidence join: Kane's reason and last steps + the proxy's fault log (which call was broken and how) + the `verify` result +
   the storm's `expect` text become one prompt (`evidence.json`, `prompt.txt` in the run folder).
4. Agent: Claude Code runs headless in the app folder with file tools only; its diff is saved as `fix.patch`.
5. Re-run the same storm. Green moves to the next storm; red repeats up to `--max-tries` (default 3) times.
6. `--final` runs every storm once more on the fixed app; the report counts that pass.

## Real run (clean, one continuous `demo --reset`, naive shop, 2026-11-15)
The full record (`REPORT.md`, `report.html`, `result.json`) is in [`evidence/s2-clean/`](evidence/s2-clean/): open `report.html` to see it with no Kane login and no credits.

| Measured | Value |
|---|---|
| Storms survived, naive -> fixed | 0/5 -> 5/5 |
| Bugs caught (storms that were red on the naive app) | 5 of 5 |
| Agent loops (Claude Code calls) | 6 |
| Kane runs | 21 (5 naive, 11 in the loop, 5 final) |
| Kane credits (sum of the runs' own counts) | 476.3 |
| Wall time | 43.9 minutes |
| Agent time | 55 s in total |
| Tries until green | flaky-pay 2, lost-response 2, pay-down 2, slow-cart 3, html-error 2 |

Ground truth from the `verify` commands on the naive app: flaky-pay 0 orders (expected 1), lost-response 2 orders (expected 1),
pay-down 0 orders (as expected, Kane was red because the page hid the error; the report shows this as a disagreement). On the
fixed app all three say ok. slow-cart and html-error have no `verify` command: Kane alone decides there.

## Limits
- Kane runs are not equal: 50 s to 405 s and 10 to 38 credits per run in our runs. One full demo costs about 500-600 credits.
- Kane sometimes fails a run although its steps passed (we saw "Child agent failed ... verification", and a negative check "never
  shows X" failed that way). The `pay-down` flow therefore uses positive checks only. A red can be a Kane flake;
  `verify` is the second opinion where the app has state to check.
- Claude Code refuses to edit files under a `.claude` folder ("sensitive file"). Run your app outside such a folder; in our npx test inside one, the agent was denied three times and the storm stayed red.
- The proxy sees plain HTTP to one app port. No HTTPS, no websockets, no other fault types than the four above.
- The agent fixes what the evidence shows. It can fix the wrong thing; the next Kane run decides, not the agent.
- `npm test` (12 tests) needs no credits and no Kane login.

## AI disclosure
The fixing agent in the loop is Claude Code (headless, Sonnet, file tools only, no shell). This repo was written with Claude Code
(Anthropic's coding agent), directed by its maintainer.
