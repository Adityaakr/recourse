#!/bin/bash
# Launch the full recourse fleet against the current deployment (reads
# deployments/hoodi.json). Each service logs to /tmp/rc-*.log. The trailing
# `wait` keeps this launcher alive so the children stay parented to it.
cd /Users/adityakrx/recourse || exit 1

pnpm --filter @recourse/indexer start   > /tmp/rc-indexer.log        2>&1 &
pnpm --filter @recourse/keeper start     > /tmp/rc-keeper.log         2>&1 &
pnpm --filter @recourse/verifier start   > /tmp/rc-verifier.log       2>&1 &
RECOURSE_PERSONA=steady     pnpm --filter @recourse/bots start > /tmp/rc-bot-steady.log     2>&1 &
RECOURSE_PERSONA=premium    pnpm --filter @recourse/bots start > /tmp/rc-bot-premium.log    2>&1 &
RECOURSE_PERSONA=cheapskate pnpm --filter @recourse/bots start > /tmp/rc-bot-cheapskate.log 2>&1 &
pnpm --filter @recourse/web dev          > /tmp/rc-web.log            2>&1 &

wait
