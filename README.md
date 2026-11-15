# BROWNOUT

Seeded network storms for any local web app. Kane CLI (TestMu) drives a real browser through your user flow while a
proxy injects faults on exact call numbers. When Kane sees the user hurt, the evidence (what the user saw plus what
the network did) goes to a coding agent, the agent patches the app, Kane re-runs, and the loop moves to the next storm.

Draft: stage 2 polishes this file.

## Use
    npm i
    node bin/brownout.mjs demo            # naive shop -> 5 storms -> agent fixes -> report in runs/<time>/
    node bin/brownout.mjs run --app "npm start" --app-port 18751 --port 18750 --flows flows/ --storms storms.json

Storms: `{name, flow, expect, faults:[{route, method, calls:"1-2"|"all", action:"status:503"|"drop-after-upstream"|"delay:ms"|"body:html-error"}]}`.
Flows are plain English with `{{BASE}}` for the proxy URL. Needs Kane CLI logged in (`kane-cli login`) and, for the
default fixer, Claude Code (`claude`).

## AI disclosure
The agent in the loop is Claude Code (headless, Sonnet, file tools only). The code of this repo was written with Claude Code.
