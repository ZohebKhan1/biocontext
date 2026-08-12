# Preface

molecules at systems-level. These kinds of analyses generate huge
quantities of data, which need to be given a biological
interpretation. A commonly used approach is via clustering in the gene
dimension for grouping different genes based on their similarities.

To search for shared functions among genes, a common way is to
incorporate the biological knowledge, such as Gene Ontology (GO) and
Kyoto Encyclopedia of Genes and Genomes (KEGG), for identifying
predominant biological themes of a collection of genes.

After clustering analysis, researchers not only want to determine
whether there is a common theme of a particular gene cluster, but also
to compare the biological themes among gene clusters. The manual step
to choose interesting clusters followed by enrichment analysis on each
selected cluster is slow and tedious. To bridge this gap, we designed
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler), for comparing and
visualizing functional
profiles among gene clusters.

# Introduction

## Terminology

### Gene sets and pathway

A gene set is an unordered collection of genes that are functionally
related. A pathway can be interpreted as a gene set by ignoring
functional relationships among genes.

### Gene Ontology (GO)

[Gene Ontology](http://www.geneontology.org/) defines concepts/classes
used to describe gene function, and relationships between these
concepts. It classifies functions along three aspects:

- MF: Molecular Function
 - molecular activities of gene products
- CC: Cellular Component
 - where gene products are active
- BP: Biological Process
 - pathways and larger processes made up of the activities of multiple
 gene products

GO terms are organized in a directed acyclic graph, where edges between
the terms represent parent-child relationship.

### Kyoto Encyclopedia of Genes and Genomes (KEGG)

[KEGG](https://www.genome.jp/kegg/) is a collection of manually drawn
pathway maps representing molecular interaction and reaction networks.
These pathways cover a wide range of biochemical processes that can be
divided in 7 broad categories: metabolism, genetic and environmental
information processing, cellular processes, organismal systems, human
diseases, and drug development[^1].

### Other gene sets

GO and KEGG are most frequently used for the functional analysis. They
are typically the first choice because their long-standing curation and
availability for a wide range of species.

Other gene sets including but not limited to Disease Ontology
([DO](http://disease-ontology.org/)), Disease Gene Network
([DisGeNET](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4397996/)),
[wikiPathways](https://www.wikipathways.org), Molecular Signatures
Database ([MSigDb](http://software.broadinstitute.org/gsea/msigdb)).

# Functional Enrichment Analysis Methods

## Over Representation Analysis

Over Representation Analysis (ORA) is a widely used
approach to determine whether known biological functions or processes
are over-represented (= enriched) in an experimentally-derived gene
list, *e.g.* a list of differentially expressed genes (DEGs).

The *p*-value can be calculated by hypergeometric distribution.

$`p = 1 - \displaystyle\sum_{i = 0}^{k-1}\frac{{M \choose i}{{N-M} \choose {n-i}}} {{N \choose n}}`$

In this equation, `N` is the total number of genes in the background
distribution, `M` is the number of genes within that distribution that
are annotated (either directly or indirectly) to the gene set of
interest, `n` is the size of the list of genes of interest and `k` is
the number of genes within that list which are annotated to the gene
set. The background distribution by default is all the genes that have
annotation. *P*-values should be adjusted for [multiple
comparison](https://en.wikipedia.org/wiki/Multiple_comparisons_problem).

**Example:** Suppose we have 17,980 genes detected in a Microarray study
and 57 genes were differentially expressed. Among the differential
expressed genes, 28 are annotated to a gene set[^2].

```r
d <- data.frame(gene.not.interest=c(2613, 15310), gene.in.interest=c(28, 29))
row.names(d) <- c("In_category", "not_in_category")
d
```

whether the overlap of 25 genes are significantly over represented in
the gene set can be assessed using hypergeometric distribution. This
corresponding to a one-sided version of Fisher’s exact test.

```r
fisher.test(d, alternative = "greater")
```

## Gene Set Enrichment Analysis

A common approach in analyzing gene expression profiles was identifying
differential expressed genes that are deemed interesting. The enrichment
analysis we demonstrated in Disease enrichment
analysis vignette were based on these
differential expressed genes. This approach will find genes where the
difference is large, but it will not detect a situation where the
difference is small, but evidenced in coordinated way in a set of
related genes. Gene Set Enrichment Analysis
(GSEA) directly addresses this limitation. All
genes can be used in GSEA; GSEA aggregates the per gene statistics
across genes within a gene set, therefore making it possible to detect
situations where all genes in a predefined set change in a small but
coordinated way. Since it is likely that many relevant phenotypic
differences are manifested by small but consistent changes in a set of
genes.

Genes are ranked based on their phenotypes. Given a priori defined set
of gene *S* (e.g., genes shareing the same *DO* category), the goal of
GSEA is to determine whether the members of *S* are randomly distributed
throughout the ranked gene list (*L*) or primarily found at the top or
bottom.

There are three key elements of the GSEA method:

- Calculation of an Enrichment Score.
 - The enrichment score (*ES*) represent the degree to which a set *S*
 is over-represented at the top or bottom of the ranked list *L*. The
 score is calculated by walking down the list *L*, increasing a
 running-sum statistic when we encounter a gene in *S* and decreasing
 when it is not. The magnitude of the increment depends on the gene
 statistics (e.g., correlation of the gene with phenotype). The *ES*
 is the maximum deviation from zero encountered in the random walk;
 it corresponds to a weighted Kolmogorov-Smirnov-like
 statistic\.
- Esimation of Significance Level of *ES*.
 - The *p*-value of the *ES* is calculated using permutation test.
 Specifically, we permute the gene labels of the gene list *L* and
 recompute the *ES* of the gene set for the permutated data, which
 generate a null distribution for the *ES*. The *p*-value of the
 observed *ES* is then calculated relative to this null distribution.
- Adjustment for Multiple Hypothesis Testing.
 - When the entire gene sets were evaluated, **DOSE** adjust
 the estimated significance level to account for multiple hypothesis
 testing and also *q*-values were calculated for FDR control.

We implemented GSEA algorithm proposed by
Subramanian\. Alexey Sergushichev implemented
an algorithm for fast GSEA analysis in the
**fgsea** package.

In **DOSE**, user can use GSEA algorithm
implemented in `DOSE` or `fgsea` by specifying the parameter `by="DOSE"`
or `by="fgsea"`. By default, **DOSE** use `fgsea` since it is
much more fast.

## Leading edge analysis and core enriched genes

Leading edge analysis reports `Tags` to indicate the percentage of genes
contributing to the enrichment score, `List` to indicate where in the
list the enrichment score is attained and `Signal` for enrichment signal
strength.

It would also be very interesting to get the core enriched genes that
contribute to the enrichment.

**DOSE** supports leading edge analysis and reports core enriched genes
in GSEA analysis.

# Universal enrichment analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
supports both hypergeometric test and gene set enrichment analyses of
many ontology/pathway, but it’s still not enough for users may want to
analyze their data with unsupported organisms, slim version of GO, novel
functional annotation (e.g. GO via BlastGO or KEGG via KAAS),
unsupported ontologies/pathways or customized annotations.

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
provides `enricher` function for hypergeometric test and `GSEA` function
for gene set enrichment analysis that are designed to accept user
defined annotation. They accept two additional parameters *TERM2GENE*
and *TERM2NAME*. As indicated in the parameter names, *TERM2GENE* is a
data.frame with first column of term ID and second column of
corresponding mapped gene and *TERM2NAME* is a data.frame with first
column of term ID and second column of corresponding term name.
*TERM2NAME* is optional.

## Input data

For over representation analysis, all we need is a gene vector, that is
a vector of gene IDs. These gene IDs can be obtained by differential
expression analysis (*e.g.* with
[DESeq2](http://www.bioconductor.org/packages/DESeq2) package).

For gene set enrichment analysis, we need a ranked list of genes.
**DOSE** provides an example dataset `geneList` which was
derived from `R` package **breastCancerMAINZ** that contained
200 samples, including 29 samples in grade I, 136 samples in grade II
and 35 samples in grade III. We computed the ratios of geometric means
of grade III samples versus geometric means of grade I samples.
Logarithm of these ratios (base 2) were stored in `geneList` dataset.

The `geneList` contains three features:

1. numeric vector: fold change or other type of numerical variable
2. named vector: every number was named by the corresponding gene ID
3. sorted vector: number should be sorted in decreasing order

Suppose you are importing your own data from a *csv* file and the file
contains two columns, one for gene ID (no duplicated allowed) and
another one for fold change, you can prepare your own `geneList` via the
following command:

```r
d <- read.csv(your_csv_file)
## assume that 1st column is ID
## 2nd column is fold change

## feature 1: numeric vector
geneList <- d[,2]

## feature 2: named vector
names(geneList) <- as.character(d[,1])

## feature 3: decreasing order
geneList <- sort(geneList, decreasing = TRUE)
```

We can load the sample data into R via:

```r
data(geneList, package="DOSE")
head(geneList)
```

Suppose we define fold change greater than 2 as DEGs:

```r
gene <- names(geneList)[abs(geneList) > 2]
head(gene)
```

## WikiPathways analysis

[WikiPathways](https://www.wikipathways.org) is a continuously updated
pathway database curated by a community of researchers and pathway
enthusiasts. WikiPathways produces monthly releases of gmt files for
supported organisms at
[data.wikipathways.org](http://data.wikipathways.org/current/gmt/).
Download the appropriate gmt file and then generate `TERM2GENE` and
`TERM2NAME` to use `enricher` and `GSEA` functions.

```r
library(magrittr)
library(clusterProfiler)

data(geneList, package="DOSE")
gene <- names(geneList)[abs(geneList) > 2]

wpgmtfile <- system.file("extdata/wikipathways-20180810-gmt-Homo_sapiens.gmt", package="clusterProfiler")
wp2gene <- read.gmt(wpgmtfile)
wp2gene <- wp2gene %>% tidyr::separate(ont, c("name","version","wpid","org"), "%")
wpid2gene <- wp2gene %>% dplyr::select(wpid, gene) #TERM2GENE
wpid2name <- wp2gene %>% dplyr::select(wpid, name) #TERM2NAME

ewp <- enricher(gene, TERM2GENE = wpid2gene, TERM2NAME = wpid2name)
head(ewp)

ewp2 <- GSEA(geneList, TERM2GENE = wpid2gene, TERM2NAME = wpid2name, verbose=FALSE)
head(ewp2)
```

You may want to convert the gene IDs to gene symbols, which can be done
by `setReadable` function.

```r
library(org.Hs.eg.db)
ewp <- setReadable(ewp, org.Hs.eg.db, keyType = "ENTREZID")
ewp2 <- setReadable(ewp2, org.Hs.eg.db, keyType = "ENTREZID")
head(ewp)
head(ewp2)
```

As an alternative to manually downloading gmt files, install the
[rWikiPathways
package](https://bioconductor.org/packages/release/bioc/html/rWikiPathways.html)
to gain scripting access to the latest gmt files using the
`downloadPathwayArchive` function.

## Cell Marker

```r
cell_markers <- vroom::vroom('http://bio-bigdata.hrbmu.edu.cn/CellMarker/download/Human_cell_markers.txt') %>%
   tidyr::unite("cellMarker", tissueType, cancerType, cellName, sep=", ") %>%
   dplyr::select(cellMarker, geneID) %>%
   dplyr::mutate(geneID = strsplit(geneID, ', '))
cell_markers
y <- enricher(gene, TERM2GENE=cell_markers, minGSSize=1)
DT::datatable(as.data.frame(y))
```

## MSigDb analysis

[Molecular Signatures
Database](http://software.broadinstitute.org/gsea/msigdb) contains 8
major collections:

- H: hallmark gene sets
- C1: positional gene sets
- C2: curated gene sets
- C3: motif gene sets
- C4: computational gene sets
- C5: GO gene sets
- C6: oncogenic signatures
- C7: immunologic signatures

Users can download GMT files from [Broad
Institute](http://software.broadinstitute.org/gsea/msigdb) and use
`read.gmt` to parse the file to be used in `enricher()` and `GSEA()`.

There is an R package,
[msigdbr](https://cran.r-project.org/package=msigdbr), that already
packed the MSigDB gene sets in tidy data format that can be used
directly with *clusterProfiler*.

It supports several specices:

```r
library(msigdbr)
msigdbr_show_species()
```

We can retrieve all human gene sets:

```r
m_df <- msigdbr(species = "Homo sapiens")
head(m_df, 2) %>% as.data.frame
```

Or specific collection. Here we use C6, oncogenic gene sets as an
example:

```r
m_t2g <- msigdbr(species = "Homo sapiens", category = "C6") %>%
  dplyr::select(gs_name, entrez_gene)
head(m_t2g)

em <- enricher(gene, TERM2GENE=m_t2g)
em2 <- GSEA(geneList, TERM2GENE = m_t2g)
head(em)
head(em2)
```

We can test with other collections, for example, using C3 to test
whether the genes are up/down-regulated by sharing specific motif.

```r
m_t2g <- msigdbr(species = "Homo sapiens", category = "C3") %>%
  dplyr::select(gs_name, entrez_gene)
head(m_t2g)

em3 <- GSEA(geneList, TERM2GENE = m_t2g)
head(em3)
```

# DAVID functional analysis

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler) provides enrichment and
GSEA analysis with GO, KEGG, DO and Reactome pathway supported internally, some user may prefer GO
and KEGG analysis with DAVID and still attracted by the visualization methods provided by
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler). To bridge the gap between
DAVID and clusterProfiler, we implemented `enrichDAVID`. This function query enrichment analysis
result from DAVID webserver via
[RDAVIDWebService](https://www.bioconductor.org/packages/RDAVIDWebService) and stored the result as
an `enrichResult` instance, so that we can use all the visualization functions in
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler) to visualize DAVID results.
`enrichDAVID` is fully compatible with `compareCluster` function and comparing enrichment results
from different gene clusters is now available with DAVID.

```r
david <- enrichDAVID(gene = gene,
 idType = "ENTREZ_GENE_ID",
 listType = "Gene",
 annotation = "KEGG_PATHWAY",
 david.user = "clusterProfiler@hku.hk")
```

DAVID Web Service has the following limitations:

+ A job with more than 3000 genes to generate gene or term cluster report will not be handled by
 DAVID due to resource limit.
+ No more than 200 jobs in a day from one user or computer.
+ DAVID Team reserves right to suspend any improper uses of the web service without notice.

For more details, please refer to
[http://david.abcc.ncifcrf.gov/content.jsp?file=WS.html](http://david.abcc.ncifcrf.gov/content.jsp?file=WS.html).

As user has limited usage, please [register](http://david.abcc.ncifcrf.gov/webservice/register.htm)
and use your own user account to run `enrichDAVID`.

# Disease analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

[DOSE](https://www.bioconductor.org/packages/DOSE)\
supports Disease Ontology (DO) Semantic and Enrichment analysis. The
`enrichDO` function is very useful for identifying disease association
of interesting genes, and function `gseDO` function is designed for gene
set enrichment analysis of *DO*.

In addition, [DOSE](https://www.bioconductor.org/packages/DOSE) also
supports enrichment analysis of [Network of Cancer
Gene](http://ncg.kcl.ac.uk/) (NCG) and [Disease Gene
Network](http://disgenet.org/), please refer to the
[DOSE](https://www.bioconductor.org/packages/DOSE) vignettes.

## `enrichDO` function

In the following example, we selected fold change above 1.5 as the
differential genes and analyzing their disease association.

```r
library(DOSE)
data(geneList)
gene <- names(geneList)[abs(geneList) > 1.5]
head(gene)
x <- enrichDO(gene = gene,
 ont = "DO",
 pvalueCutoff = 0.05,
 pAdjustMethod = "BH",
 universe = names(geneList),
 minGSSize = 5,
 maxGSSize = 500,
 qvalueCutoff = 0.05,
 readable = FALSE)
head(x)
```

The `enrichDO` function requires an entrezgene ID vector as input,
mostly is the differential gene list of gene expression profile studies.
If user needs to convert other gene ID type to entrezgene ID, we
recommend using `bitr` function provided by
**clusterProfiler**.

The `ont` parameter can be “DO” or “DOLite”, DOLite was
constructed to aggregate the redundant DO terms. The DOLite data is not
updated, we recommend user use `ont="DO"`. `pvalueCutoff` setting the
cutoff value of *p* value and *p* value adjust; `pAdjustMethod` setting
the *p* value correction methods, include the Bonferroni correction
(“bonferroni”), Holm (“holm”), Hochberg (“hochberg”), Hommel (“hommel”),
Benjamini & Hochberg (“BH”) and Benjamini & Yekutieli (“BY”) while
`qvalueCutoff` is used to control *q*-values.

The `universe` setting the background gene universe for testing. If user
do not explicitly setting this parameter, `enrichDO` will set the
universe to all human genes that have DO annotation.

The `minGSSize` (and `maxGSSize`) indicates that only those DO terms
that have more than `minGSSize` (and less than `maxGSSize`) genes
annotated will be tested.

The `readable` is a logical parameter, indicates whether the entrezgene
IDs will mapping to gene symbols or not.

We also implement `setReadable` function that helps the user to convert
entrezgene IDs to gene symbols.

```r
x <- setReadable(x, 'org.Hs.eg.db')
head(x)
```

## `enrichNCG` function

[Network of Cancer Gene](http://ncg.kcl.ac.uk/) (NCG) is a
manually curated repository of cancer genes. NCG release 5.0 (Aug. 2015)
collects 1,571 cancer genes from 175 published studies.
**DOSE** supports analyzing gene list and determine whether
they are enriched in genes known to be mutated in a given cancer type.

```r
gene2 <- names(geneList)[abs(geneList) < 3]
ncg <- enrichNCG(gene2)
head(ncg)
```

## `enrichDGN` and `enrichDGNv` functions

[DisGeNET](http://disgenet.org/) is an integrative
and comprehensive resources of gene-disease associations from several
public data sources and the literature. It contains gene-disease
associations and snp-gene-disease associations.

The enrichment analysis of disease-gene associations is supported by the
`enrichDGN` function and analysis of snp-gene-disease associations is
supported by the `enrichDGNv` function.

```r
dgn <- enrichDGN(gene)
head(dgn)

snp <- c("rs1401296", "rs9315050", "rs5498", "rs1524668", "rs147377392",
 "rs841", "rs909253", "rs7193343", "rs3918232", "rs3760396",
 "rs2231137", "rs10947803", "rs17222919", "rs386602276", "rs11053646",
 "rs1805192", "rs139564723", "rs2230806", "rs20417", "rs966221")
dgnv <- enrichDGNv(snp)
head(dgnv)
```

## `gseDO` fuction

In the following example, in order to speedup the compilation of this
document, only gene sets with size above 120 were tested and only 100
permutations were performed.

```r
library(DOSE)
data(geneList)
y <- gseDO(geneList,
 nPerm = 100,
 minGSSize = 120,
 pvalueCutoff = 0.2,
 pAdjustMethod = "BH",
 verbose = FALSE)
head(y, 3)
```

## `gseNCG` fuction

```r
ncg <- gseNCG(geneList,
 nPerm = 100,
 minGSSize = 120,
 pvalueCutoff = 0.2,
 pAdjustMethod = "BH",
 verbose = FALSE)
ncg <- setReadable(ncg, 'org.Hs.eg.db')
head(ncg, 3)
```

## `gseDGN` fuction

```r
dgn <- gseDGN(geneList,
 nPerm = 100,
 minGSSize = 120,
 pvalueCutoff = 0.2,
 pAdjustMethod = "BH",
 verbose = FALSE)
dgn <- setReadable(dgn, 'org.Hs.eg.db')
head(dgn, 3)
```

# Gene Ontology Analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

## Supported organisms

GO analyses (`groupGO()`, `enrichGO()` and `gseGO()`) support organisms
that have an `OrgDb` object available.

Bioconductor have already provide `OrgDb` for about [20
species](http://bioconductor.org/packages/release/BiocViews.html#___OrgDb).
User can query `OrgDb` online by
[AnnotationHub](https://www.bioconductor.org/packages/AnnotationHub) or
build their own by
[AnnotationForge](https://www.bioconductor.org/packages/AnnotationForge).
An example can be found in the
[vignette](https://bioconductor.org/packages/devel/bioc/vignettes/GOSemSim/inst/doc/GOSemSim.html#supported-organisms)
of [GOSemSim](https://www.bioconductor.org/packages/GOSemSim).

If user have GO annotation data (in data.frame format with first column
of gene ID and second column of GO ID), they can use `enricher()` and
`gseGO()` functions to perform over-representation test and gene set
enrichment analysis.

If genes are annotated by direction annotation, it should also annotated
by its ancestor GO nodes (indirect annation). If user only has direct
annotation, they can pass their annotation to `buildGOmap` function,
which will infer indirection annotation and generate a `data.frame` that
suitable for both `enricher()` and `gseGO()`.

## GO classification

In
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler),
`groupGO` is designed for gene classification based on GO distribution
at a specific level. Here we use dataset `geneList` provided by
[DOSE](https://www.bioconductor.org/packages/DOSE). Please refer to
vignette of [DOSE](https://www.bioconductor.org/packages/DOSE) for more
details.

```r
library(clusterProfiler)
data(geneList, package="DOSE")
gene <- names(geneList)[abs(geneList) > 2]
gene.df <- bitr(gene, fromType = "ENTREZID",
 toType = c("ENSEMBL", "SYMBOL"),
 OrgDb = org.Hs.eg.db)
head(gene.df)
ggo <- groupGO(gene = gene,
 OrgDb = org.Hs.eg.db,
 ont = "CC",
 level = 3,
 readable = TRUE)

head(ggo)
```

The input parameters of *gene* is a vector of gene IDs (can be any ID
type that supported by corresponding `OrgDb`).

If *readable* is setting to *TRUE*, the input gene IDs will be converted
to gene symbols.

## GO over-representation test

Over-representation test were implemented in
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler).
For calculation details and explanation of paramters, please refer to
the vignette of [DOSE](https://www.bioconductor.org/packages/DOSE).

```r
ego <- enrichGO(gene = gene,
 universe = names(geneList),
 OrgDb = org.Hs.eg.db,
 ont = "CC",
 pAdjustMethod = "BH",
 pvalueCutoff = 0.01,
 qvalueCutoff = 0.05,
 readable = TRUE)
head(ego)
```

As I mentioned before, any gene ID type that supported in `OrgDb` can be
directly used in GO analyses. User need to specify the `keyType`
parameter to specify the input gene ID type.

```r
ego2 <- enrichGO(gene = gene.df$ENSEMBL,
 OrgDb = org.Hs.eg.db,
 keyType = 'ENSEMBL',
 ont = "CC",
 pAdjustMethod = "BH",
 pvalueCutoff = 0.01,
 qvalueCutoff = 0.05)
```

Gene ID can be mapped to gene Symbol by using paramter `readable=TRUE`
or `setReadable` function.

```r
ego2 <- setReadable(ego2, OrgDb = org.Hs.eg.db)
```

### drop specific GO terms or level

`enrichGO` test the whole GO corpus and enriched result may contains
very general terms. With `dropGO` function, user can remove specific GO
terms or GO level from results obtained from both `enrichGO` and
`compareCluster`.

### test GO at sepcific level

`enrichGO` doesn’t contain parameter to restrict the test at specific GO
level. Instead, we provide a function `gofilter` to restrict the result
at specific GO level. It works with results obtained from both
`enrichGO` and `compareCluster`.

### reduce redundancy of enriched GO terms

GO is organized in parent-child structure, thus a parent term can be
overlap with a large proportion with all its child terms. This can
result in redundant findings. To solve this issue,
**clusterProfiler** implement
[`simplify`](https://github.com/GuangchuangYu/clusterProfiler/issues/28)
method to reduce redundant GO terms from the outputs of `enrichGO` and
`gseGO`. The function internally called **GOSemSim**
 to calculate semantic similarity among GO terms and remove
those highly similar terms by keeping one representative term. An
example can be found in [the blog
post](https://guangchuangyu.github.io/2015/10/use-simplify-to-remove-redundancy-of-enriched-go-terms/).

## GO Gene Set Enrichment Analysis

A common approach in analyzing gene expression profiles was identifying
differential expressed genes that are deemed interesting. The enrichment
analysis we demonstrated previous were based on these differential
expressed genes. This approach will find genes where the difference is
large, but it will not detect a situation where the difference is small,
but evidenced in coordinated way in a set of related genes. Gene Set
Enrichment Analysis (GSEA) directly addresses
this limitation. All genes can be used in GSEA; GSEA aggregates the per
gene statistics across genes within a gene set, therefore making it
possible to detect situations where all genes in a predefined set change
in a small but coordinated way. Since it is likely that many relevant
phenotypic differences are manifested by small but consistent changes in
a set of genes.

For algorithm details, please refer to the vignette of
[DOSE](https://www.bioconductor.org/packages/DOSE).

```r
ego3 <- gseGO(geneList = geneList,
 OrgDb = org.Hs.eg.db,
 ont = "CC",
 nPerm = 1000,
 minGSSize = 100,
 maxGSSize = 500,
 pvalueCutoff = 0.05,
 verbose = FALSE)
```

GSEA use permutation test, user can set *nPerm* for number of
permutations. Only gene Set size in `[minGSSize, maxGSSize]` will be
tested.

If you have issues in preparing your own `geneList`, please refer to the
[wiki
page](https://github.com/GuangchuangYu/DOSE/wiki/how-to-prepare-your-own-geneList).

## GO Semantic Similarity Analysis

GO semantic similarity can be calculated by
[GOSemSim](https://www.bioconductor.org/packages/GOSemSim)\.
We can use it to cluster genes/proteins into different clusters based on
their functional similarity and can also use it to measure the
similarities among GO terms to reduce the redundancy of GO enrichment
results.

### GO analysis for non-model organisms

Both `enrichGO` and `gseGO` functions require an `OrgDb` object as
background annotation. For organisms that don’t have `OrgDb` provided by
Bioconductor, users can query one (if available) online via
**AnnotationHub**. If there is no `OrgDb` available, users
can obtain GO annotation from other sources, e.g. from
**biomaRt** or [Blast2GO](https://www.blast2go.com/). Then
using `enricher` or `GSEA` function to analyze, similar to the examples
using wikiPathways and MSigDB. Another solution is to create `OrgDb` by
your own using **AnnotationForge** package.

# KEGG analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

The annotation package, `KEGG.db`, is not updated since 2012. It’s now
pretty old and in
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler),
`enrichKEGG` (for KEGG pathway) and `enrichMKEGG` (for KEGG module)
supports downloading latest online version of KEGG data for enrichment
analysis. Using `KEGG.db` is also supported by explicitly setting
*use_internal_data* parameter to *TRUE*, but it’s not recommended.

With this new feature, organism is not restricted to those supported in
previous release, it can be any species that have KEGG annotation data
available in KEGG database. User should pass abbreviation of academic
name to the *organism* parameter. The full list of KEGG supported
organisms can be accessed via
<http://www.genome.jp/kegg/catalog/org_list.html>. [KEGG
Orthology](https://www.genome.jp/kegg/ko.html) (KO) Database is also
supported by specifying `organism = "ko"`.

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
provides `search_kegg_organism()` function to help searching supported
organisms.

```r
library(clusterProfiler)
search_kegg_organism('ece', by='kegg_code')
ecoli <- search_kegg_organism('Escherichia coli', by='scientific_name')
dim(ecoli)
head(ecoli)
```

## KEGG over-representation test

```r
data(geneList, package="DOSE")
gene <- names(geneList)[abs(geneList) > 2]

kk <- enrichKEGG(gene = gene,
 organism = 'hsa',
 pvalueCutoff = 0.05)
head(kk)
```

Input ID type can be `kegg`, `ncbi-geneid`, `ncbi-proteinid` or
`uniprot`, an example can be found in [the
post](https://guangchuangyu.github.io/2016/05/convert-biological-id-with-kegg-api-using-clusterprofiler/).

## KEGG Gene Set Enrichment Analysis

```r
kk2 <- gseKEGG(geneList = geneList,
 organism = 'hsa',
 nPerm = 1000,
 minGSSize = 120,
 pvalueCutoff = 0.05,
 verbose = FALSE)
head(kk2)
```

## KEGG Module over-representation test

[KEGG Module](http://www.genome.jp/kegg/module.html) is a collection of
manually defined function units. In some situation, KEGG Modules have a
more straightforward interpretation.

```r
mkk <- enrichMKEGG(gene = gene,
 organism = 'hsa')
```

## KEGG Module Gene Set Enrichment Analysis

```r
mkk2 <- gseMKEGG(geneList = geneList,
 organism = 'hsa')
```

# MSigDb analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

The MSigDB is a collection of annotated gene sets, it include 8 major
collections:

- H: hallmark gene sets
- C1: positional gene sets
- C2: curated gene sets
- C3: motif gene sets
- C4: computational gene sets
- C5: GO gene sets
- C6: oncogenic signatures
- C7: immunologic signatures

Users can use `enricher` and `GSEA` function to analyze gene set
collections downloaded from Molecular Signatures Database
([MSigDb](http://www.broadinstitute.org/gsea/msigdb/index.jsp)).
[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
provides a function, `read.gmt`, to parse the [gmt
file](https://www.broadinstitute.org/cancer/software/gsea/wiki/index.php/Data_formats#GMT:_Gene_Matrix_Transposed_file_format_.28.2A.gmt.29)
into a *TERM2GENE* `data.frame` that is ready for both `enricher` and
`GSEA` functions.

```r
data(geneList, package="DOSE")
gene <- names(geneList)[abs(geneList) > 2]

gmtfile <- system.file("extdata", "c5.cc.v5.0.entrez.gmt", package="clusterProfiler")
c5 <- read.gmt(gmtfile)

egmt <- enricher(gene, TERM2GENE=c5)
head(egmt)

egmt2 <- GSEA(geneList, TERM2GENE=c5, verbose=FALSE)
head(egmt2)
```

# Reactome pathway analysis

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

[ReactomePA](https://www.bioconductor.org/packages/ReactomePA)\
uses Reactome as a source of pathway data. The function call of
`enrichPathway` and `gsePathway` in
[ReactomePA](https://www.bioconductor.org/packages/ReactomePA) is
consistent with `enrichKEGG` and `gseKEGG`.

# MeSH enrichment analysis

`meshes` supports enrichment analysis (over-representation analysis and
gene set enrichment analysis) of gene list or whole expression profile
using MeSH annotation. Data source from `gendoo`, `gene2pubmed` and
`RBBH` are all supported. User can selecte interesting category to test.
All 16 categories are supported. The analysis supports >70 species
listed in [MeSHDb
BiocView](https://bioconductor.org/packages/release/BiocViews.html#___MeSHDb).

For algorithm details, please refer to the vignettes of
**DOSE** package.

```r
library(meshes)
data(geneList, package="DOSE")
de <- names(geneList)[1:100]
x <- enrichMeSH(de, MeSHDb = "MeSH.Hsa.eg.db", database='gendoo', category = 'C')
head(x)
```

In the over-representation analysis, we use data source from `gendoo`
and `C` (Diseases) category.

In the following example, we use data source from `gene2pubmed` and test
category `G` (Phenomena and Processes) using GSEA.

```r
y <- gseMeSH(geneList, MeSHDb = "MeSH.Hsa.eg.db", database = 'gene2pubmed', category = "G")
head(y)
```

User can use visualization methods implemented in
**enrichplot** (i.e.`barplot`, `dotplot`, `cnetplot`,
`emapplot` and `gseaplot`) to visualize these enrichment results. With
these visualization methods, it’s much easier to interpret enriched
results.

```r
dotplot(x)
gseaplot(y, y, title=y)
```

# Functional enrichment analysis of genomic coordinations

Functional analysis using NGS data (eg, RNA-seq and ChIP-Seq) can be
performed by linking coding and non-coding regions to coding genes via
**ChIPseeker** package, which can
annotates genomic regions to their nearest genes, host genes, and
flanking genes respectivly. In addtion, it provides a function,
`seq2gene`, that simultaneously considering host genes, promoter region
and flanking gene from intergenic region that may under control via
cis-regulation. This function maps genomic regions to genes in a
many-to-many manner and facilitate functional analysis. For more
details, please refer to
**ChIPseeker**.

# Biological theme comparison

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
library(clusterProfiler)
```

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
was developed for biological theme comparison, and it
provides a function, `compareCluster`, to automatically calculate
enriched functional categories of each gene clusters.

```r
data(gcSample)
lapply(gcSample, head)
```

The input for *geneCluster* parameter should be a named list of gene
IDs. To speed up the compilation of this document, we set
`use_internal_data = TRUE`.

```r
ck <- compareCluster(geneCluster = gcSample, fun = "enrichKEGG")
head(as.data.frame(ck))
```

## Formula interface of compareCluster

`compareCluster` also supports passing a formula (the code to support
formula has been contributed by Giovanni Dall’Olio) of type
$`Entrez \sim group`$ or $`Entrez \sim group + othergroup`$.

```r
mydf <- data.frame(Entrez=names(geneList), FC=geneList)
mydf <- mydf[abs(mydf$FC) > 1,]
mydf$group <- "upregulated"
mydf$group[mydf$FC < 0] <- "downregulated"
mydf$othergroup <- "A"
mydf$othergroup[abs(mydf$FC) > 2] <- "B"

formula_res <- compareCluster(Entrez~group+othergroup, data=mydf, fun="enrichKEGG")

head(as.data.frame(formula_res))
```

## Visualization of profile comparison

We can visualize the result using `dotplot` method.

```r
dotplot(ck)
dotplot(formula_res)
dotplot(formula_res, x=~group) + ggplot2::facet_grid(~othergroup)
```

By default, only top 5 (most significant) categories of each cluster was
plotted. User can changes the parameter *showCategory* to specify how
many categories of each cluster to be plotted, and if *showCategory* was
set to *NULL*, the whole result will be plotted.

The *plot* function accepts a parameter *by* for setting the scale of
dot sizes. The default parameter *by* is setting to “geneRatio”, which
corresponding to the “GeneRatio” column of the output. If it was setting
to *count*, the comparison will be based on gene counts, while if
setting to *rowPercentage*, the dot sizes will be normalized by
*count/(sum of each row)*

To provide the full information, we also provide number of identified
genes in each category (numbers in parentheses) when *by* is setting to
*rowPercentage* and number of gene clusters in each cluster label
(numbers in parentheses) when *by* is setting to *geneRatio*, as shown
in Figure 3. If the dot sizes were based on *count*, the row numbers
will not shown.

The p-values indicate that which categories are more likely to have
biological meanings. The dots in the plot are color-coded based on their
corresponding p-values. Color gradient ranging from red to blue
correspond to in order of increasing p-values. That is, red indicate low
p-values (high enrichment), and blue indicate high p-values (low
enrichment). P-values and adjusted p-values were filtered out by the
threshold giving by parameter *pvalueCutoff*, and FDR can be estimated
by *qvalue*.

User can refer to the example in Yu (2012); we analyzed the
publicly available expression dataset of breast tumour tissues from 200
patients (GSE11121, Gene Expression Omnibus)\. We
identified 8 gene clusters from differentially expressed genes, and
using `compareCluster` to compare these gene clusters by their enriched
biological process.

The comparison function was designed as a framework for comparing gene
clusters of any kind of ontology associations, not only `groupGO`,
`enrichGO`, `enrichKEGG` and `enricher` provided in this package, but
also other biological and biomedical ontologies, for instance,
`enrichDO` from
[DOSE](https://www.bioconductor.org/packages/DOSE),
`enrichMeSH` from [meshes](https://www.bioconductor.org/packages/meshes)
and `enrichPathway` from
[ReactomePA](https://www.bioconductor.org/packages/ReactomePA) work fine
with `compareCluster` for comparing biological themes in disease and
reactome pathway perspective. More details can be found in the vignettes
of [DOSE](https://www.bioconductor.org/packages/DOSE)\
and [ReactomePA](https://www.bioconductor.org/packages/ReactomePA).

# Visualization of Functional Enrichment Result

The **enrichplot** package implements several visualization
methods to help interpreting enrichment results. It supports visualizing
enrichment results obtained from **DOSE**,
**clusterProfiler**, **ReactomePA**
 and **meshes**. Both over
representation analysis (ORA) and gene set enrichment analysis (GSEA)
are supported.

Many of these visualization methods were first implemented in
**DOSE** and rewrote from scratch using `ggplot2`. If you
want to use old methods[^3], you can use the
[doseplot](https://github.com/GuangchuangYu/doseplot) package.

## Bar Plot

Bar plot is the most widely used method to visualize enriched terms. It
depicts the enrichment scores (*e.g.* p values) and gene count or ratio
as bar height and color.

```r
library(DOSE)
data(geneList)
de <- names(geneList)[abs(geneList) > 2]

edo <- enrichDGN(de)
library(enrichplot)
barplot(edo, showCategory=20)
```

## Dot plot

Dot plot is similar to bar plot with the capability to encode another
score as dot size.

```r
edo2 <- gseNCG(geneList, nPerm=10000)
p1 <- dotplot(edo, showCategory=30) + ggtitle("dotplot for ORA")
p2 <- dotplot(edo2, showCategory=30) + ggtitle("dotplot for GSEA")
plot_grid(p1, p2, ncol=2)
```

## Gene-Concept Network

Both the `barplot` and `dotplot` only displayed most significant
enriched terms, while users may want to know which genes are involved in
these significant terms. In order to consider the potentially biological
complexities in which a gene may belong to multiple annotation
categories and provide information of numeric changes if available, we
developed `cnetplot` function to extract the complex association. The
`cnetplot` depicts the linkages of genes and biological concepts (*e.g.*
GO terms or KEGG pathways) as a network. GSEA result is also supported
with only core enriched genes displayed.

```r
## convert gene ID to Symbol
edox <- setReadable(edo, 'org.Hs.eg.db', 'ENTREZID')
p1 <- cnetplot(edox, foldChange=geneList)
## categorySize can be scaled by 'pvalue' or 'geneNum'
p2 <- cnetplot(edox, categorySize="pvalue", foldChange=geneList)
p3 <- cnetplot(edox, foldChange=geneList, circular = TRUE, colorEdge = TRUE)
cowplot::plot_grid(p1, p2, p3, ncol=3, labels=LETTERS[1:3], rel_widths=c(.8,.8, 1.2))
```

If you would like label subset of the nodes, you can use the
`node_label` parameter, which supports 4 possible selections
(i.e. “category”, “gene”, “all” and “none”), as demonstrated in Figure
the corresponding example.

```r
p1 <- cnetplot(edox, node_label="category")
p2 <- cnetplot(edox, node_label="gene")
p3 <- cnetplot(edox, node_label="all")
p4 <- cnetplot(edox, node_label="none")
cowplot::plot_grid(p1, p2, p3, p4, ncol=2, labels=LETTERS[1:4])
```

## Heatmap-like functional classification

The `heatplot` is similar to `cnetplot`, while displaying the
relationships as a heatmap. The gene-concept network may become too
complicated if user want to show a large number significant terms. The
`heatplot` can simplify the result and more easy to identify expression
patterns.

```r
p1 <- heatplot(edox)
p2 <- heatplot(edox, foldChange=geneList)
cowplot::plot_grid(p1, p2, ncol=1, labels=LETTERS[1:2])
```

## Enrichment Map

Enrichment map organizes enriched terms into a network with edges
connecting overlapping gene sets. In this way, mutually overlapping gene
sets are tend to cluster together, making it easy to identify functional
module.

The `emapplot` function supports results obtained from hypergeometric
test and gene set enrichment analysis. The `pie_scale` parameter can be
used to resize nodes, as demonstrated in the corresponding example,
and the `layout` parameter can adjust the layout, as demonstrated in
the corresponding example.

```r
p1 <- emapplot(edo)
p2 <- emapplot(edo, pie_scale=1.5)
p3 <- emapplot(edo,layout="kk")
p4 <- emapplot(edo, pie_scale=1.5,layout="kk")
cowplot::plot_grid(p1, p2, p3, p4, ncol=2, labels=LETTERS[1:4])
```

The `emapplot` function also supports results obtained from
`compareCluster` function of `clusterProfiler` package. In addition to
`pie_scale` and `layout` parameters, the number of circles in the bottom
left corner can be adjusted using the `legend_n` parameteras, as
demonstrated in the corresponding example. And proportion of
clusters in the pie chart can be adjusted using the `pie` parameter,
when `pie="count"`, the proportion of clusters in the pie chart is
determined by the number of genes, as demonstrated in Figure
the corresponding example C and D.

```r
library(clusterProfiler)
data(gcSample)
xx <- compareCluster(gcSample, fun="enrichKEGG",
 organism="hsa", pvalueCutoff=0.05)
p1 <- emapplot(xx)
p2 <- emapplot(xx,legend_n=2)
p3 <- emapplot(xx,pie="count")
p4 <- emapplot(xx,pie="count", pie_scale=1.5, layout="kk")
cowplot::plot_grid(p1, p2, p3, p4, ncol=2, labels=LETTERS[1:4])
```

## UpSet Plot

The `upsetplot` is an alternative to `cnetplot` for visualizing the
complex association between genes and gene sets. It emphasizes the gene
overlapping among different gene sets.

```r
upsetplot(edo)
```

For over-representation analysis, `upsetplot` will calculate the
overlaps among different gene sets as demonstrated in Figure
the corresponding example. For GSEA result, it will plot the fold change
distributions of different categories (e.g. unique to pathway, overlaps
among different pathways).

```r
upsetplot(kk2)
```

## ridgeline plot for expression distribution of GSEA result

The `ridgeplot` will visualize expression distributions of core enriched
genes for GSEA enriched categories. It helps users to interpret
up/down-regulated pathways.

```r
ridgeplot(edo2)
```

## running score and preranked list of GSEA result

Running score and preranked list are traditional methods for visualizing
GSEA result. The **enrichplot** package supports both of them
to visualize the distribution of the gene set and the enrichment score.

```r
p1 <- gseaplot(edo2, geneSetID = 1, by = "runningScore", title = edo2$Description)
p2 <- gseaplot(edo2, geneSetID = 1, by = "preranked", title = edo2$Description)
p3 <- gseaplot(edo2, geneSetID = 1, title = edo2$Description)
cowplot::plot_grid(p1, p2, p3, ncol=1, labels=LETTERS[1:3])
```

Another method to plot GSEA result is the `gseaplot2` function:

```r
gseaplot2(edo2, geneSetID = 1, title = edo2$Description)
```

The `gseaplot2` also supports multile gene sets to be displayed on the
same figure:

```r
gseaplot2(edo2, geneSetID = 1:3)
```

User can also displaying the pvalue table on the plot via `pvalue_table`
parameter:

```r
gseaplot2(edo2, geneSetID = 1:3, pvalue_table = TRUE,
 color = c("#E495A5", "#86B875", "#7DB0DD"), ES_geom = "dot")
```

User can specify `subplots` to only display a subset of plots:

```r
p1 <- gseaplot2(edo2, geneSetID = 1:3, subplots = 1)
p2 <- gseaplot2(edo2, geneSetID = 1:3, subplots = 1:2)
cowplot::plot_grid(p1, p2, ncol=1, labels=LETTERS[1:2])
```

The `gsearank` function plot the ranked list of genes belong to the
specific gene set.

```r
gsearank(edo2, 1, title = edo2[1, "Description"])
```

Multiple gene sets can be aligned using `cowplot`: (ref:gsearank2scap)
Gsearank for multiple gene sets.

```r
library(ggplot2)
library(cowplot)

pp <- lapply(1:3, function(i) {
 anno <- edo2[i, c("NES", "pvalue", "p.adjust")]
 lab <- paste0(names(anno), "=", round(anno, 3), collapse="\n")

 gsearank(edo2, i, edo2[i, 2]) + xlab(NULL) +ylab(NULL) +
 annotate("text", 0, edo2[i, "enrichmentScore"] *.9, label = lab, hjust=0, vjust=0)
plot_grid(plotlist=pp, ncol=1)
```

## pubmed trend of enriched terms

One of the problem of enrichment analysis is to find pathways for
further investigation. Here, we provide `pmcplot` function to plot the
number/proportion of publications trend based on the query result from
PubMed Central. Of course, users can use `pmcplot` in other scenarios.
All text that can be queried on PMC is valid as input of `pmcplot`.

```r
terms <- edo$Description[1:3]
p <- pmcplot(terms, 2010:2017)
p2 <- pmcplot(terms, 2010:2017, proportion=FALSE)
plot_grid(p, p2, ncol=2)
```

## goplot

`goplot` can accept output of `enrichGO` and visualized the enriched GO
induced graph.

```r
goplot(ego)
```

## browseKEGG

To view the KEGG pathway, user can use `browseKEGG` function, which will
open web browser and highlight enriched genes.

```r
browseKEGG(kk, 'hsa04110')
```

## pathview from pathview package

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
users can also use `pathview` from the
[pathview](https://www.bioconductor.org/packages/pathview)\
to visualize KEGG pathway.

The following example illustrate how to visualize “hsa04110” pathway,
which was enriched in our previous analysis.

```r
library("pathview")
hsa04110 <- pathview(gene.data = geneList,
 pathway.id = "hsa04110",
 species = "hsa",
 limit = list(gene=max(abs(geneList)), cpd=1))
```

For further information, please refer to the vignette of
[pathview](https://www.bioconductor.org/packages/pathview)\.

# dplyr verbs for clusterProfiler

[clusterProfiler.dplyr](https://github.com/YuLab-SMU/clusterProfiler.dplyr)
package.

```r
library(DOSE)
library(clusterProfiler.dplyr)
library(ggplot2)
library(forcats)
library(enrichplot)
theme_set(theme_grey())
select <- clusterProfiler.dplyr:::select.enrichResult
library(DOSE)
data(geneList)
de = names(geneList)[1:100]
x = enrichDO(de)
```

## filter

```r
library(clusterProfiler.dplyr)

filter(x, p.adjust <.05, qvalue < 0.2)
```

## arrange

```r
mutate(x, geneRatio = parse_ratio(GeneRatio)) %>%
 arrange(desc(geneRatio))
```

## select

```r
select(x, -geneID) %>% head
```

## mutate

```r
y <- mutate(x, richFactor = Count / as.numeric(sub("/\\d+", "", BgRatio)))
y

library(ggplot2)
library(forcats)
library(enrichplot)

ggplot(y, showCategory = 20,
 aes(richFactor, fct_reorder(Description, richFactor))) +
 geom_segment(aes(xend=0, yend = Description)) +
 geom_point(aes(color=p.adjust, size = Count)) +
 scale_color_viridis_c(guide=guide_colorbar(reverse=TRUE)) +
 scale_size_continuous(range=c(2, 10)) +
 theme_minimal() +
 xlab("rich factor") +
 ylab(NULL) +
 ggtitle("Enriched Disease Ontology")
```

A very similar concept is Fold Enrichment, which is defined as the ratio
of two proportions, (k/n) / (M/N). Using `mutate` to add the fold
enrichment variable is also easy:

```r
mutate(x, FoldEnrichment = parse_ratio(GeneRatio) / parse_ratio(BgRatio))
```

## slice

We can use `slice` to choose rows by their ordinal position in the
enrichment result. Grouped result use the ordinal position with the
group.

In the following example, a GSEA result of Reactome pathway was sorted
by the absolute values of NES and the result was grouped by the sign of
NES. We then extracted first 5 rows of each groups. The result was
displayed in the corresponding example.

```r
library(ReactomePA)
data(geneList)
x <- gsePathway(geneList)

library(clusterProfiler.dplyr)
y <- arrange(x, abs(NES)) %>%
 group_by(sign(NES)) %>%
 slice(1:5)

library(forcats)
library(ggplot2)
library(ggstance)
library(enrichplot)

ggplot(y, aes(NES, fct_reorder(Description, NES), fill=qvalues), showCategory=10) +
 geom_barh(stat='identity') +
 scale_fill_continuous(low='red', high='blue', guide=guide_colorbar(reverse=TRUE)) +
 theme_minimal() + ylab(NULL)
```

## summarise

```r
pi=seq(0, 1, length.out=11)

mutate(x, pp = cut(pvalue, pi)) %>%
 group_by(pp) %>%
 summarise(cnt = n()) %>%
 ggplot(aes(pp, cnt)) + geom_col() +
 theme_minimal() +
 xlab("p value intervals") +
 ylab("Frequency") +
 ggtitle("p value distribution")
```

# Useful utilities

```r
library(knitr)
opts_chunk$set(message=FALSE, warning=FALSE, eval=TRUE, echo=TRUE, cache=TRUE)
```

## `bitr`: Biological Id TranslatoR

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler)
provides `bitr` and `bitr_kegg` for converting ID types. Both `bitr` and
`bitr_kegg` support many species including model and many non-model
organisms.

```r
x <- c("GPX3", "GLRX", "LBP", "CRYAB", "DEFB1", "HCLS1", "SOD2", "HSPA2",
 "ORM1", "IGFBP1", "PTHLH", "GPC3", "IGFBP3","TOB1", "MITF", "NDRG1",
 "NR1H4", "FGFR3", "PVR", "IL6", "PTPRM", "ERBB2", "NID2", "LAMB1",
 "COMP", "PLS3", "MCAM", "SPP1", "LAMC1", "COL4A2", "COL4A1", "MYOC",
 "ANXA4", "TFPI2", "CST6", "SLPI", "TIMP2", "CPM", "GGT1", "NNMT",
 "MAL", "EEF1A2", "HGD", "TCN2", "CDA", "PCCA", "CRYM", "PDXK",
 "STC1", "WARS", "HMOX1", "FXYD2", "RBP4", "SLC6A12", "KDELR3", "ITM2B")
eg = bitr(x, fromType="SYMBOL", toType="ENTREZID", OrgDb="org.Hs.eg.db")
head(eg)
```

User should provides an annotation package, both *fromType* and *toType*
can accept any types that supported.

User can use *keytypes* to list all supporting types.

```r
library(org.Hs.eg.db)
keytypes(org.Hs.eg.db)
```

We can translate from one type to other types.

```r
ids <- bitr(x, fromType="SYMBOL", toType=c("UNIPROT", "ENSEMBL"), OrgDb="org.Hs.eg.db")
head(ids)
```

For GO analysis, user don’t need to convert ID, all ID type provided by
`OrgDb` can be used in `groupGO`, `enrichGO` and `gseGO` by specifying
`keyType` parameter.

### `bitr_kegg`: converting biological IDs using KEGG API

```r
data(gcSample)
hg <- gcSample
head(hg)

eg2np <- bitr_kegg(hg, fromType='kegg', toType='ncbi-proteinid', organism='hsa')
head(eg2np)
```

The ID type (both `fromType` & `toType`) should be one of ‘kegg’,
‘ncbi-geneid’, ‘ncbi-proteinid’ or ‘uniprot’. The ‘kegg’ is the primary
ID used in KEGG database. The data source of KEGG was from NCBI. A rule
of thumb for the ‘kegg’ ID is `entrezgene` ID for eukaryote species and
`Locus` ID for prokaryotes.

Many prokaryote species don’t have entrezgene ID available. For example
we can check the gene information of `ece:Z5100` in
<http://www.genome.jp/dbget-bin/www_bget?ece:Z5100>, which have
`NCBI-ProteinID` and `UnitProt` links in the `Other DBs` Entry, but not
`NCBI-GeneID`.

If we try to convert `Z5100` to `ncbi-geneid`, `bitr_kegg` will throw
error of `ncbi-geneid is not supported`.

```r
bitr_kegg("Z5100", fromType="kegg", toType='ncbi-geneid', organism='ece')
```

 ## Error in KEGG_convert(fromType, toType, organism):
 ## ncbi-geneid is not supported for ece...

We can of course convert it to `ncbi-proteinid` and `uniprot`:

```r
bitr_kegg("Z5100", fromType="kegg", toType='ncbi-proteinid', organism='ece')
bitr_kegg("Z5100", fromType="kegg", toType='uniprot', organism='ece')
```

## `setReadable`: translating gene IDs to human readable symbols

Some of the functions, especially those internally supported for
[DO](#chapter4), [GO](#chapter5), and [Reactome Pathway](#chapter8),
support a parameter, `readable`. If `readable = TRUE`, all the gene IDs
will be translated to gene symbols. The `readable` parameter is not
available for enrichment analysis of KEGG or using user’s own
annotation. KEGG analysis using `enrichKEGG` and `gseKEGG`, internally
query annotation information from KEEGG database and thus support all
species if it is available in the KEGG database. However, KEGG database
doesn’t provide gene ID to symbol mapping information. For analysis
using user’s own annotation data, we even don’t know what species is in
analyzed. Translating gene IDs to gene symbols is partly supported using
the `setReadable` function if and only if there is an `OrgDb` available.

```r
library(org.Hs.eg.db)
library(clusterProfiler)

data(geneList, package="DOSE")
de <- names(geneList)[1:100]
x <- enrichKEGG(de)
## The geneID column is ENTREZID
head(x, 3)

y <- setReadable(x, OrgDb = org.Hs.eg.db, keyType="ENTREZID")
## The geneID column is translated to symbol
head(y, 3)
```

For those functions that internally support `readable` parameter, user
can also use `setReadable` for translating gene IDs. \# (APPENDIX)
Appendix {-}

[^1]: <https://pathview.uncc.edu/data/khier.tsv>

[^2]: example adopted from
 <https://guangchuangyu.github.io/cn/2012/04/enrichment-analysis/>

[^3]: <https://www.biostars.org/p/375555>
