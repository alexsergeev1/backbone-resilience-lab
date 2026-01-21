# Backbone Resilience Lab

[Live demo](https://alexsergeev1.github.io/backbone-resilience-lab/)

Break links in a 16-city, 31-link synthetic backbone. Inspect the resulting traffic, rank the next single-link failures, and schedule repairs with one to three crews.

Minimum-cost maximum flow allocates capacity to priority demand and breaks ties by aggregate link latency. A bounded beam search minimizes 14 hours of weighted unmet demand and compares the result with a greedy restoration plan. The map, timeline, city audit, and CSV make each decision inspectable.

Capital planning evaluates every feasible combination of eight upgrades under a budget. A seeded regional hazard model couples failures across nearby links. Optimize mean loss, worst-decile loss, or a blend over 48 training scenarios, then compare the winner with a greedy budget rule and no investment on 96 independent scenarios. The cost–risk frontier and holdout CSV expose the trade-offs.

```sh
node --test
node serve.mjs
```

Open http://127.0.0.1:8092. All topology, demand, and incidents are synthetic. The January 2026 Git timestamp is illustrative.
