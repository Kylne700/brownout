# BROWNOUT report

Storms survived: 0/5 naive -> 5/5 fixed. Bugs caught: 5. Agent loops: 6. Kane credits: 476.3. Minutes: 43.9.
Agent: Claude Code (headless). Agent time: 55 s.

| Storm | Naive | Tries | Final | App state | Kane said | Fault | Files changed | Credits | Sec |
|---|---|---|---|---|---|---|---|---|---|
| flaky-pay | RED | 1:RED -> 2:green | green | FAIL -> ok | Checkpoint assertion failed: "the page shows the text 'Order confirmed'" | POST /api/pay #1 status:503 | server.mjs | 85.5 | 381 |
| lost-response | RED | 1:RED -> 2:green | green | FAIL -> ok | Checkpoint assertion failed: "Verify the page shows exactly the text 'Orders: 1'" | POST /api/pay #1 drop-after-upstream | server.mjs | 123.4 | 537 |
| pay-down | RED | 1:RED -> 2:green | green | ok (DISAGREES with Kane) -> ok | Checkpoint assertion failed: "a message containing the words 'payment is unavailable' is visible" | POST /api/pay #1 status:503 | server.mjs | 86.9 | 686 |
| slow-cart | RED | 1:RED -> 2:RED -> 3:green | green | - | Checkpoint assertion failed: "the page is never blank: it must show either the text 'Loading your cart', or the cart listing 'Mug', or an error message with a 'Try again' button" | GET /api/cart #1 delay:12000 | server.mjs | 135.6 | 769 |
| html-error | RED | 1:RED -> 2:green | green | - | Checkpoint assertion failed: "the page shows at least one visible heading, line of text or button" | GET /api/products #1 body:html-error; GET /api/products #2 body:html-error | server.mjs | 45.0 | 202 |
