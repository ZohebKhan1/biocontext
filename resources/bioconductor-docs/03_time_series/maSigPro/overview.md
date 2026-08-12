# maSigPro overview

**Official source:** [Bioconductor package
overview](https://bioconductor.org/packages/release/bioc/vignettes/maSigPro/inst/doc/maSigPro.pdf)

maSigPro analyzes single-series and multiple-series time-course expression data from
microarrays or RNA sequencing. It identifies genes with statistically significant temporal
changes and separates genes by their fitted response profiles.

## Two-stage regression workflow

1. Fit a general regression model for each gene. For experiments with multiple series, the
 model uses dummy variables to represent the experimental groups. Select significant genes
 with false-discovery-rate control.
2. Apply stepwise regression to the selected genes to identify the model terms that explain
 each temporal profile. Use the retained coefficients and fitted values for visualization,
 clustering, and biological interpretation.

maSigPro also provides workflows for detecting differences in transcript isoform usage over
time. See [vignette.md](vignette.md) for the complete user guide and
[reference.md](reference.md) for exact function arguments and defaults.
