# GSVA on single-cell RNA-seq data
## Overview

Here we illustrate how to use GSVA with single-cell RNA sequencing (scRNA-seq) data.

# Introduction

GSVA provides now specific support for single-cell data in the algorithm that runs through the
`gsvaParam()` parameter constructor, and originally described in the publication by [Hänzelmann,
Castelo, and Guinney]. At the moment, this
specific support consists of the following features:

- The input expression data can be stored in different types of data containers prepared to store
 sparse single-cell data. These types of sparse data containers can be broadly categorized in those
 that only store the expression values, and those that may store additional row and column
 metadata. The currently available value-only containers for input are `dgCMatrix`,
 `SVT_SparseArray`, and `DelayedMatrix`. The currently available container for single-cell data
 that allows one to input additional row and column metadata is a `SingleCellExperiment` object.
- While the input single-cell data is always sparse, the output of enrichment scores will be always
 dense, and therefore, the container storing those scores will be different from the input data,
 typically a `matrix` or a dense `DelayedMatrix` object. The latter will be particularly used when
 the total number of values exceeds 2\^31, which is the largest 32-bit standard integer value in R.
- By default, when the input expression data is stored in a sparse data container, as it typically
 happens with single-cell data, then a slightly a slightly modified GSVA algorithm will run, if
 GSVA is the choice of algorithm, by which nonzero values are treated differently from zero values,
 leading to slightly different results than those obtained by applying the classical GSVA
 algorithm. If we set the parameter `sparse=FALSE` in the call to `gsvaParam()`, the classical GSVA
 algorithm will be used, which for a typical single-cell data set will result in longer running
 times and larger memory consumption than running it in the default sparse regime for this type of
 data.

In what follows, we will illustrate the use of GSVA on a publicly available single-cell
transcriptomics data set of peripheral blood mononuclear cells (PBMCs) published by [Zheng et al.

# Import data

We import the PBMC data using the
*[TENxPBMCData](https://bioconductor.org/packages/3.22/TENxPBMCData)* package, as a
`SingleCellExperiment` object, defined in the
*[SingleCellExperiment](https://bioconductor.org/packages/3.22/SingleCellExperiment)* package.

```r
library(SingleCellExperiment)
library(TENxPBMCData)

sce <- TENxPBMCData(dataset="pbmc4k")
sce
class: SingleCellExperiment
dim: 33694 4340
metadata(0):
assays(1): counts
rownames(33694): ENSG00000243485 ENSG00000237613 ... ENSG00000277475
  ENSG00000268674
rowData names(3): ENSEMBL_ID Symbol_TENx Symbol
colnames: NULL
colData names(11): Sample Barcode ... Individual Date_published
reducedDimNames(0):
mainExpName: NULL
altExpNames(0):
```

# Quality assessment and pre-processing

Here, we perform a quality assessment and pre-processing steps using the package
*[scuttle](https://bioconductor.org/packages/3.22/scuttle)*. We start identifying mitochondrial
genes.

```r
library(scuttle)

is_mito <- grepl("^MT-", rowData(sce)$Symbol_TENx)
table(is_mito)
is_mito
FALSE  TRUE
33681    13
```

Calculate quality control (QC) metrics and filter out low-quality cells.

```r
sce <- quickPerCellQC(sce, subsets=list(Mito=is_mito),
                           sub.fields="subsets_Mito_percent")
dim(sce)
[1] 33694  4147
```

Figure (#fig:cntxgene) below shows the empirical cumulative distribution of counts per gene in
logarithmic scale.

```r
cntxgene <- rowSums(assays(sce)$counts)+1
plot.ecdf(cntxgene, xaxt="n", panel.first=grid(), xlab="UMI counts per gene",
          log="x", main="", xlim=c(1, 1e5), las=1)
axis(1, at=10^(0:5), labels=10^(0:5))
abline(v=100, lwd=2, col="red")
```

The red vertical bar indicates a cutoff value of 100 UMI counts per gene across all cells, below
which genes will be filtered out.

We filter out lowly-expressed genes, by selecting those with at least 100 UMI counts across all
cells for downstream analysis.

```r
sce <- sce[cntxgene >= 100, ]
dim(sce)
[1] 8823 4147
```

Calculate library size factors and normalized units of expression in logarithmic scale.

```r
sce <- computeLibraryFactors(sce)
sce <- logNormCounts(sce)
assayNames(sce)
[1] "counts"    "logcounts"
```

# Annotate cell types using GSVA

Here, we illustrate how to annotate cell types in the PBMC data using GSVA.

## Read gene sets in GMT format

First, we fetch a collection of 22 leukocyte gene set signatures, containing a total 547 genes,
which should help to distinguish among 22 mature human hematopoietic cell type populations isolated
from peripheral blood or *in vitro* culture conditions, including seven T cell types: naïve and
memory B cells, plasma cells, NK cell, and myeloid subsets. These gene sets have been used in the
benchmarking publication by Diaz-Mejia et al.,
and were originally compiled by the [CIBERSORT](https://cibersortx.stanford.edu) developers, where
they called it the LM22 signature. The LM22 signature is stored in the
*[GSVAdata](https://bioconductor.org/packages/3.22/GSVAdata)* experiment data package as a
compressed text file in [GMT format](https://www.genepattern.org/file-formats-guide/#GMT), which can
be read into R using the `readGMT()` function from the
*[GSVA](https://bioconductor.org/packages/3.22/GSVA)* package, and will return the gene sets into a
`GeneSetCollection` object, defined in the
*[GSEABase](https://bioconductor.org/packages/3.22/GSEABase)* package.

```r
library(GSEABase)
library(GSVA)

fname <- file.path(system.file("extdata", package="GSVAdata"),
                   "pbmc_cell_type_gene_set_signatures.gmt.gz")
gsets <- readGMT(fname)
gsets
GeneSetCollection
  names: B_CELLS_MEMORY, B_CELLS_NAIVE, ..., T_CELLS_REGULATORY_TREGS (22 total)
  unique identifiers: AIM2, BANK1, ..., SKAP1 (248 total)
  types in collection:
    geneIdType: SymbolIdentifier (1 total)
    collectionType: NullCollection (1 total)
```

## Add gene identifier type metadata

Note that while gene identifers in the `sce` object correspond to [Ensembl stable
identifiers](https://www.ensembl.org/info/genome/stable_ids/index.html) (`ENSG...`), the gene
identifiers in the gene sets are [HGNC](https://www.genenames.org) gene symbols. This, in principle,
precludes matching directly what gene in the single-cell data object `sce` corresponds to what gene
set in the `GeneSetCollection` object `gsets`. However, the
*[GSVA](https://bioconductor.org/packages/3.22/GSVA)* package can do that matching as long as the
appropriate metadata is present in both objects.

In the case of a `GeneSetCollection` object, its `geneIdType` metadata slot stores the type of gene
identifier. In the case of a `SingleCellExperiment` object, such as the previous `sce` object, such
metadata is not present. However, using the function `gsvaAnnotation()` from the
*[GSVA](https://bioconductor.org/packages/3.22/GSVA)* package, and the helper function
`ENSEMBLIdentifier()` from the *[GSEABase](https://bioconductor.org/packages/3.22/GSEABase)*
package, we add such metadata to the `sce` object as follows.

```r
gsvaAnnotation(sce) <- ENSEMBLIdentifier("org.Hs.eg.db")
gsvaAnnotation(sce)
geneIdType: ENSEMBL (org.Hs.eg.db)
```

## Build parameter object

We first build a parameter object using the function `gsvaParam()`. By default, the expression
values in the `logocounts` assay will be selected for downstream analysis.

```r
gsvapar <- gsvaParam(sce, gsets)
gsvapar
A GSVA::gsvaParam object
expression data:
  class: SingleCellExperiment
  dim: 8823 4147
  metadata(1): annotation
  assays(2): counts logcounts
  rownames(8823): ENSG00000279457 ENSG00000228463 ... ENSG00000198727
    ENSG00000273748
  rowData names(3): ENSEMBL_ID Symbol_TENx Symbol
  colnames: NULL
  colData names(22): Sample Barcode ... discard sizeFactor
  reducedDimNames(0):
  mainExpName: NULL
  altExpNames(0):
using assay: logcounts
using annotation:
  geneIdType: ENSEMBL (org.Hs.eg.db)
gene sets:
  GeneSetCollection
    names: B_CELLS_MEMORY, B_CELLS_NAIVE, ..., T_CELLS_REGULATORY_TREGS (22 total)
    unique identifiers: AIM2, BANK1, ..., SKAP1 (248 total)
    types in collection:
      geneIdType: SymbolIdentifier (1 total)
      collectionType: NullCollection (1 total)
gene set size: [1, Inf]
kcdf: auto
kcdfNoneMinSampleSize: 200
tau: 1
maxDiff: TRUE
absRanking: FALSE
sparse:  TRUE
checkNA: auto
missing data: didn't check
filterRows:  TRUE
ondisk:  auto
nonzero values: less than 2^31 (INT_MAX)
```

## Calculate GSVA scores

While at this point, we could already run the entire GSVA algorithm with a call to the
`gsva(gsvapar)` function. We show here how to do it in two steps. First we calculate GSVA rank
values using the function `gsvaRanks()`.

```r
gsvaranks <- gsvaRanks(gsvapar)
gsvaranks
A GSVA::gsvaRanksParam object
expression data:
  class: SingleCellExperiment
  dim: 8823 4147
  metadata(1): annotation
  assays(3): counts logcounts gsvaranks
  rownames(8823): ENSG00000279457 ENSG00000228463 ... ENSG00000198727
    ENSG00000273748
  rowData names(3): ENSEMBL_ID Symbol_TENx Symbol
  colnames: NULL
  colData names(22): Sample Barcode ... discard sizeFactor
  reducedDimNames(0):
  mainExpName: NULL
  altExpNames(0):
using assay: gsvaranks
using annotation:
  geneIdType: ENSEMBL (org.Hs.eg.db)
gene sets:
  GeneSetCollection
    names: B_CELLS_MEMORY, B_CELLS_NAIVE, ..., T_CELLS_REGULATORY_TREGS (22 total)
    unique identifiers: AIM2, BANK1, ..., SKAP1 (248 total)
    types in collection:
      geneIdType: SymbolIdentifier (1 total)
      collectionType: NullCollection (1 total)
gene set size: [1, Inf]
kcdf: auto
kcdfNoneMinSampleSize: 200
tau: 1
maxDiff: TRUE
absRanking: FALSE
sparse:  TRUE
checkNA: auto
missing data: didn't check
filterRows:  TRUE
ondisk:  auto
nonzero values: less than 2^31 (INT_MAX)
```

Second, we calculate the GSVA scores using the output of `gsvaRanks()` as input to the function
`gsvaScores()`. By default, this function will calculate the scores for all gene sets specified in
the input parameter object.

```r
es <- gsvaScores(gsvaranks)
es
class: SingleCellExperiment
dim: 22 4147
metadata(0):
assays(1): es
rownames(22): B_CELLS_MEMORY B_CELLS_NAIVE ... T_CELLS_GAMMA_DELTA
  T_CELLS_REGULATORY_TREGS
rowData names(1): gs
colnames: NULL
colData names(22): Sample Barcode ... discard sizeFactor
reducedDimNames(0):
mainExpName: NULL
altExpNames(0):
```

However, we could calculate the scores for another collection of gene sets by updating them in the
`gsvaranks` object as follows.

```r
geneSets(gsvaranks) <- geneSets(gsvapar)[1:2]
es2 <- gsvaScores(gsvaranks)
```

## Using GSVA scores to assign cell types

Following Amezquita et al., and some of
the steps described in "Chapter 5 Clustering" of the first version of the [OSCA
book](https://bioconductor.org/books/3.16/OSCA.basic/clustering.html), we use GSVA scores to build a
nearest-neighbor graph of the cells using the function `buildSNNGraph()` from the
*[scran](https://bioconductor.org/packages/3.22/scran)* package. The parameter `k` in the call to
`buildSNNGraph()` specifies the number of nearest neighbors to consider during graph construction,
and here we set `k=20` because it leads to a number of clusters close to the expected number of cell
types.

```r
library(scran)

g <- buildSNNGraph(es, k=20, assay.type="es")
```

Second, we use the function `cluster_walktrap()` from the
*[igraph](https://CRAN.R-project.org/package=igraph)* package, to cluster cells by finding densely
connected subgraphs. We store the resulting vector of cluster indicator values into the `sce` object
using the function `colLabels()`.

```r
library(igraph)

colLabels(es) <- factor(cluster_walktrap(g)$membership)
table(colLabels(es))

  1   2   3   4   5   6   7   8
495 601 502 525 972 191 345 516
```

Similarly to Diaz-Mejia et al., we apply a
simple cell type assignment algorithm, which consists of selecting at each cell the gene set with
highest GSVA score, tallying the selected gene sets per cluster, and assigning to the cluster the
most frequent gene set, storing that assignment into the `sce` object with the function
`colLabels()`.

```r
## whmax <- apply(assay(es), 2, which.max)
whmax <- apply(assay(es), 2, function(x) which.max(as.vector(x)))
gsxlab <- split(rownames(es)[whmax], colLabels(es))
gsxlab <- names(sapply(sapply(gsxlab, table), which.max))
colLabels(es) <- factor(gsub("[0-9]\\.", "", gsxlab))[colLabels(es)]
table(colLabels(es))

     B_CELLS_NAIVE        EOSINOPHILS NK_CELLS_ACTIVATED   NK_CELLS_RESTING
               601               1027                495                191
 T_CELLS_CD4_NAIVE        T_CELLS_CD8
              1488                345
```

We can visualize the cell type assignments by projecting cells dissimilarity in two dimensions with
a principal components analysis (PCA) on the GSVA scores, and coloring cells using the previously
assigned clusters.

```r
library(RColorBrewer)

res <- prcomp(assay(es))
varexp <- res$sdev^2 / sum(res$sdev^2)
nclusters <- nlevels(colLabels(es))
hmcol <- colorRampPalette(brewer.pal(nclusters, "Set1"))(nclusters)
par(mar=c(4, 5, 1, 1))
plot(res$rotation[, 1], res$rotation[, 2], col=hmcol[colLabels(es)], pch=19,
     xlab=sprintf("PCA 1 (%.0f%%)", varexp[1]*100),
     ylab=sprintf("PCA 2 (%.0f%%)", varexp[2]*100),
     las=1, cex.axis=1.2, cex.lab=1.5)
legend("topright", gsub("_", " ", levels(colLabels(es))), fill=hmcol, inset=0.01)
```

Finally, if we want to better understand why a specific cell type is annotated to a given cell, we
can use the `gsvaEnrichment()` function, which will show a GSEA enrichment plot. This function takes
as input the output of `gsvaRanks()`, a given column (cell) in the input singl-cell data, and a
given gene set. In Figure (#fig:gsvaenrichment) below, we show such a plot for the first cell
annotated to the eosinophil cell type.

```r
firsteosinophilcell <- which(colLabels(es) == "EOSINOPHILS")[1]
par(mar=c(4, 5, 1, 1))
gsvaEnrichment(gsvaranks, column=firsteosinophilcell, geneSet="EOSINOPHILS",
               cex.axis=1.2, cex.lab=1.5, plot="ggplot")
```

In the previous call to `gsvaEnrichment()` we used the argument `plot="ggplot"` to produce a plot
with the [ggplot2](https://cran.r-project.org/package=ggplot2) package. By default, if we call
`gsvaEnrichment()` interactively, it will produce a plot using "base R", but either when we do it
non-interactively, or when we set `plot="no"` it will return a `data.frame` object with the
enrichment data.

# Forthcoming features

These are features that we are working on and we expect to have them implemented in the near future
(e.g., next release):

- A specific implementation of the other methods ssGSEA, PLAGE and zscore to work on large datasets
 stored using a `DelayedArray` backend, such as HDF5, is not yet available.

We are still benchmarking and testing this version of GSVA for single-cell data. If you encounter
problems or have suggestions, do not hesitate to contact us by opening an
[issue](https://github.com/rcastelo/GSVA/issues) in the GSVA GitHub repo.
