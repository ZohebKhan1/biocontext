# A brief introduction to edgeR

#### October 2012 (last revised 21 June 2023)

# What is it?

edgeR is a package for differential analyses of read count data from sequencing technologies such as
RNA-seq, ChIP-seq, ATAC-seq, BS-seq and CUT&RUN. It has particularly strong capabilities for
expression analyses of RNA-seq data, including gene expression, transcript expression and tests for
differential splicing.

edgeR implements novel statistical methods based on the negative binomial distribution as a model
for count variability, including empirical Bayes methods, exact tests, and generalized linear
models. The package is especially suitable for analysing designed experiments with multiple
experimental factors but possibly small numbers of replicates. It has unique abilities to model
transcript specific variation even in small samples, a capability essential for prioritizing genes
or transcripts that have consistent effects across replicates.
