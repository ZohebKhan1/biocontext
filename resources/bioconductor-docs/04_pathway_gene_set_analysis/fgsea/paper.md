# Fast gene set enrichment analysis

**Official source:** [bioRxiv preprint](https://www.biorxiv.org/content/10.1101/060012v3)

The fgsea method accelerates preranked gene set enrichment analysis while retaining accurate
tail probabilities. This matters when many pathways must be tested or when very small
P-values are needed for multiple-testing correction.

## FGSEA-simple

The simple algorithm reuses sampled gene sets across pathways and pathway sizes instead of
running an independent permutation procedure for every pathway. It calculates enrichment
scores for the sampled sets and uses cumulative statistics to estimate pathway P-values.
This makes routine enrichment substantially faster, but the number of permutations still
limits the smallest P-value that can be resolved reliably.

## FGSEA-multilevel

The multilevel algorithm uses adaptive multilevel splitting Monte Carlo estimation for
pathways that require more precise tail probabilities. It estimates a sequence of conditional
probabilities rather than waiting for a rare extreme score to appear in ordinary permutations.
The implementation combines the simple and multilevel approaches so ordinary pathways are
handled cheaply and difficult tail estimates receive additional computation.

## Validation and pathway reduction

The authors compared the approximation against an exact dynamic-programming calculation and
against conventional permutation results across many expression datasets. The package also
provides a procedure for reducing redundant enriched pathways while retaining representative
pathways that explain the signal.

The publisher's structured HTML encodes several equations as images, so this clean summary
omits those equations rather than transcribing them unreliably. Consult the official paper for
the mathematical derivation, [vignette.md](vignette.md) for the standard workflow, and
[reference.md](reference.md) for the current API.
