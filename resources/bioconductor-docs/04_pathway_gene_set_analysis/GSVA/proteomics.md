# GSVA for proteomics

Rendered from official package documentation HTML.

## Proteomics workflow

**Official source:**
https://bioconductor.org/packages/release/bioc/vignettes/GSVA/inst/doc/GSVA_proteomics.html

### Introduction

Proteomics data, such as the one produced through the Clinical Proteomic Tumor Analysis Consortium
([CPTAC](https://www.cancer.gov/research/resources/resource/176)), can have a massive amount of
missing values, in which imputing can result in regressing to the mean, underestimating protein
expression variability. In such a setting, skipping missing values from the calculations may
constitute a suitable alternative to imputation. The GSVA package provides a missing data policy for
the GSVA and ssGSEA methods, illustrated here with the proteomics example distributed in the
*[GSVAdata](https://bioconductor.org/packages/3.23/GSVAdata)* experiment data package.

```r
library(SummarizedExperiment)
library(GSVA)
library(GSVAdata)

data(geneprotExpCostaEtAl2021)
ls()
[1] "geneExpCostaEtAl2021" "protExpCostaEtAl2021"
protExpCostaEtAl2021
class: RangedSummarizedExperiment
dim: 245 20
metadata(1): annotation
assays(3): logCPM log2protexp log2protexpimp
rownames(245): 5715 9973 ... 25793 7094
rowData names(2): Symbol UniquePeptides
colnames(20): BS03 BS05 ... BS23 BS24
colData names(2): FIR Sex
assayNames(protExpCostaEtAl2021)
[1] "logCPM"         "log2protexp"    "log2protexpimp"
```

The data is stored in a `SummarizedExperiment` object called `protExpCostaEtAl2021` with three
assays:

- `logCPM` with the normalized log-CPM RNA-seq expression values for the 245 genes encoding the
 quantified proteins.
- `log2protexp` with the normalized protein units of expression, and the missing quantifications
 specified by `NA` values.
- `log2protexpimp` with the normalized protein units of expression, but where the missing
 quantifications have been imputed.

### Load gene sets

We will use the MSigDB C7 collection of immunologic genesets, reading them with the `readGMT()`
function of the GSVA package.

```r
library(GSEABase)

URL <- "https://data.broadinstitute.org/gsea-msigdb/msigdb/release/2024.1.Hs/c7.immunesigdb.v2024.1.Hs.symbols.gmt"
c7.genesets <- readGMT(URL)
```

 GeneSetCollection
 names: GOLDRATH_EFF_VS_MEMORY_CD8_TCELL_DN, GOLDRATH_EFF_VS_MEMORY_CD8_TCELL_UP,...,
KAECH_NAIVE_VS_MEMORY_CD8_TCELL_UP (4872 total)
 unique identifiers: ABCA2, ABCC5,..., LINC00841 (20457 total)
 types in collection:
 geneIdType: SymbolIdentifier (1 total)
 collectionType: NullCollection (1 total)

We filter this collection of gene sets to those formed by gene upregulated in innate leukocytes and
adaptive mature lymphocytes, excluding those reported in studies on myeloid cells and the lupus
autoimmune disease.

```r
innatepat <- c("NKCELL_VS_.+_UP", "MAST_CELL_VS_.+_UP",
               "EOSINOPHIL_VS_.+_UP", "BASOPHIL_VS_.+_UP",
               "MACROPHAGE_VS_.+_UP", "NEUTROPHIL_VS_.+_UP")
innatepat <- paste(innatepat, collapse="|")
innategsets <- names(c7.genesets)[grep(innatepat, names(c7.genesets))]
length(innategsets)
[1] 53

adaptivepat <- c("CD4_TCELL_VS_.+_UP", "CD8_TCELL_VS_.+_UP", "BCELL_VS_.+_UP")
adaptivepat <- paste(adaptivepat, collapse="|")
adaptivegsets <- names(c7.genesets)[grep(adaptivepat, names(c7.genesets))]
excludepat <- c("NAIVE", "LUPUS", "MYELOID")
excludepat <- paste(excludepat, collapse="|")
adaptivegsets <- adaptivegsets[-grep(excludepat, adaptivegsets)]
length(adaptivegsets)
[1] 97

c7.genesets.filt <- c7.genesets[c(innategsets, adaptivegsets)]
length(c7.genesets.filt)
[1] 150
```

### Usage and benchmark with RNA-seq data

Here we show first a quick benchmarking using the logCPM expression profiles, which are complete, by
introducing `NA` values with the pattern of missing data observed in the corresponding proteins.

```r
logCPMsWithNAs <- assay(protExpCostaEtAl2021, "logCPM")
logCPMsWithNAs[1:5, 1:5]
          BS03     BS05     BS06     BS07     BS08
5715  3.826346 3.785976 3.016652 3.641209 3.547332
9973  3.028686 2.633021 3.281683 3.382893 2.699961
5688  5.101717 5.404292 4.314238 4.136742 4.969074
10627 7.622114 7.779064 6.894152 7.239640 7.899282
8672  7.077862 7.725863 6.068174 6.156980 6.970647
logCPMsWithNAs[is.na(assay(protExpCostaEtAl2021, "log2protexp"))] <- NA
logCPMsWithNAs[1:5, 1:5]
          BS03     BS05     BS06     BS07     BS08
5715  3.826346 3.785976       NA 3.641209 3.547332
9973        NA 2.633021       NA       NA       NA
5688  5.101717       NA       NA       NA       NA
10627       NA 7.779064       NA 7.239640       NA
8672  7.077862 7.725863 6.068174 6.156980 6.970647
```

We need to add the annotation metadata to this new matrix of expression profiles with missing
values.

```r
gsvaAnnotation(logCPMsWithNAs) <- EntrezIdentifier("org.Hs.eg.db")
```

When building the parameter object, GSVA will check automatically for the presence of missing values
whenever the input expression data container is a non-sparse container of expression values, such as
a base matrix object or a `SummarizedExperiment` object.

```r
gsvapar <- gsvaParam(logCPMsWithNAs, c7.genesets.filt, minSize=5)
! Input expression data has NA values, which will be propagated through calculations
```

We can force the `gsvaParam()` function to check for missing values irrespective of the input
expression data container by setting the argument `checkNA="yes"`, or disable that check altogether
with `checkNA="no"`. By default `checkNA="auto"`. Once missing values have been detected when we
build the parameter object, the `gsva()` function (or `gsvaRanks()` and `gsvaScores()`) will apply a
missing data policy specified through a parameter called `use`, which takes one of the following
three possible character string values: `everything`, `all.obs` or `na.rm`. The first value
(`everything`) is the default value and it propagates the missing `NA` values through the
calculations.

```r
es_gsva_everything <- gsva(gsvapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Calculating GSVA ranks
ℹ kcdf='auto' (default)
ℹ GSVA dense (classical) algorithm
ℹ Row-wise ECDF estimation with Gaussian kernels
ℹ Calculating row ECDFs
ℹ Calculating column ranks
ℹ Mapping identifiers
ℹ GSVA dense (classical) algorithm
ℹ Calculating GSVA scores for 36 gene sets
✔ Calculations finished
es_gsva_everything[1:10, 1:4]
                                                          BS03 BS05 BS06 BS07
GSE18804_SPLEEN_MACROPHAGE_VS_BRAIN_TUMORAL_MACROPHAGE_UP   NA   NA   NA   NA
GSE2585_THYMIC_MACROPHAGE_VS_MTEC_UP                        NA   NA   NA   NA
GSE27786_NKCELL_VS_NEUTROPHIL_UP                            NA   NA   NA   NA
GSE27786_NKCELL_VS_NKTCELL_UP                               NA   NA   NA   NA
GSE27859_MACROPHAGE_VS_DC_UP                                NA   NA   NA   NA
GSE3982_EOSINOPHIL_VS_BASOPHIL_UP                           NA   NA   NA   NA
GSE3982_MAST_CELL_VS_BASOPHIL_UP                            NA   NA   NA   NA
GSE3982_MAST_CELL_VS_BCELL_UP                               NA   NA   NA   NA
GSE3982_MAST_CELL_VS_CENT_MEMORY_CD4_TCELL_UP               NA   NA   NA   NA
GSE3982_MAST_CELL_VS_DC_UP                                  NA   NA   NA   NA
all(is.na(es_gsva_everything))
[1] TRUE
```

So, in this case, there are so many missing values that the resulting enrichment scores are all `NA`
values. If we try the second option `use="all.obs"` it will immediately produce an error at the
parameter building step.

```r
gsvapar <- gsvaParam(logCPMsWithNAs, c7.genesets.filt, minSize=5,
                     use="all.obs")
Error in `.check_for_na_values()`:
✖ Input expression data has NA values.
```

Finally, if we set `use="na.rm"`, missing `NA` values will be skipped during calculations, giving
the chance to obtain non-missing enrichment scores for those gene sets with enough genes with
non-missing expression values.

```r
gsvapar <- gsvaParam(logCPMsWithNAs, c7.genesets.filt, minSize=5,
                     use="na.rm")
! Input expression data has NA values, which will be discarded from calculations
es_gsva_narm <- gsva(gsvapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Calculating GSVA ranks
ℹ kcdf='auto' (default)
ℹ GSVA dense (classical) algorithm
ℹ Row-wise ECDF estimation with Gaussian kernels
ℹ Calculating row ECDFs
ℹ Calculating column ranks
ℹ Mapping identifiers
ℹ GSVA dense (classical) algorithm
ℹ Calculating GSVA scores for 36 gene sets
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
✔ Calculations finished
round(es_gsva_narm[1:10, 1:4], digits=2)
                                                           BS03  BS05 BS06 BS07
GSE18804_SPLEEN_MACROPHAGE_VS_BRAIN_TUMORAL_MACROPHAGE_UP    NA  0.41   NA   NA
GSE2585_THYMIC_MACROPHAGE_VS_MTEC_UP                         NA    NA   NA   NA
GSE27786_NKCELL_VS_NEUTROPHIL_UP                             NA -0.30   NA   NA
GSE27786_NKCELL_VS_NKTCELL_UP                             -0.07  0.06 0.56   NA
GSE27859_MACROPHAGE_VS_DC_UP                               0.15 -0.08   NA   NA
GSE3982_EOSINOPHIL_VS_BASOPHIL_UP                          0.62  0.68   NA 0.29
GSE3982_MAST_CELL_VS_BASOPHIL_UP                           0.30  0.25   NA 0.27
GSE3982_MAST_CELL_VS_BCELL_UP                              0.12  0.20   NA   NA
GSE3982_MAST_CELL_VS_CENT_MEMORY_CD4_TCELL_UP              0.57  0.51   NA 0.32
GSE3982_MAST_CELL_VS_DC_UP                                   NA    NA   NA   NA
```

These parameters work exactly in the same way with the ssGSEA method.

```r
ssgseapar <- ssgseaParam(logCPMsWithNAs, c7.genesets.filt, minSize=5,
                         use="na.rm")
! Input expression data has NA values, which will be discarded from calculations
es_ssgsea_narm <- gsva(ssgseapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Mapping identifiers
ℹ Calculating ssGSEA scores for 36 gene sets
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
ℹ Normalizing ssGSEA scores
✔ Calculations finished
round(es_ssgsea_narm[1:10, 1:4], digits=2)
                                                          BS03 BS05 BS06 BS07
GSE18804_SPLEEN_MACROPHAGE_VS_BRAIN_TUMORAL_MACROPHAGE_UP   NA 0.27   NA   NA
GSE2585_THYMIC_MACROPHAGE_VS_MTEC_UP                        NA   NA   NA   NA
GSE27786_NKCELL_VS_NEUTROPHIL_UP                            NA 0.13   NA   NA
GSE27786_NKCELL_VS_NKTCELL_UP                             0.15 0.21 0.12   NA
GSE27859_MACROPHAGE_VS_DC_UP                              0.15 0.18   NA   NA
GSE3982_EOSINOPHIL_VS_BASOPHIL_UP                         0.52 0.60   NA 0.30
GSE3982_MAST_CELL_VS_BASOPHIL_UP                          0.10 0.18   NA 0.18
GSE3982_MAST_CELL_VS_BCELL_UP                             0.30 0.54   NA   NA
GSE3982_MAST_CELL_VS_CENT_MEMORY_CD4_TCELL_UP             0.18 0.10   NA 0.09
GSE3982_MAST_CELL_VS_DC_UP                                  NA   NA   NA   NA
```

Since we are doing calculations on the RNA-seq data, for which we have the complete logCPM values,
we can compare how close are the enrichment scores obtained by skipping `NA` values from the ones
obtained with the complete data, for both GSVA and ssGSEA. First, we calculate the enrichment scores
with the complete data for each of the two methods.

```r
gsvaAnnotation(protExpCostaEtAl2021) <- EntrezIdentifier("org.Hs.eg.db")
gsvapar <- gsvaParam(protExpCostaEtAl2021, c7.genesets.filt,
                     assay="logCPM", minSize=5)
es_gsva <- gsva(gsvapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Calculating GSVA ranks
ℹ kcdf='auto' (default)
ℹ GSVA dense (classical) algorithm
ℹ Row-wise ECDF estimation with Gaussian kernels
ℹ Calculating row ECDFs
ℹ Calculating column ranks
ℹ Mapping identifiers
ℹ GSVA dense (classical) algorithm
ℹ Calculating GSVA scores for 36 gene sets
✔ Calculations finished
ssgseapar <- ssgseaParam(protExpCostaEtAl2021, c7.genesets.filt,
                         assay="logCPM", minSize=5)
es_ssgsea <- gsva(ssgseapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Mapping identifiers
ℹ Calculating ssGSEA scores for 36 gene sets
ℹ Normalizing ssGSEA scores
✔ Calculations finished
```

Second, we calculate and plot the correlations between the enrichment scores obtained from the data
with missing values with the ones obtained from the complete data.

```r
r_es_gsva <- r_es_ssgsea <- numeric(nrow(es_gsva))
for (i in 1:nrow(es_gsva)) {
  r_es_gsva[i] <- cor(assay(es_gsva)[i, ], es_gsva_narm[i, ],
              use="complete.obs")
  r_es_ssgsea[i] <- cor(assay(es_ssgsea)[i, ], es_ssgsea_narm[i, ],
            use="complete.obs")
}
boxplot(list(GSVA=r_es_gsva, ssGSEA=r_es_ssgsea),
    ylab="Correlation with complete data", las=1)
```

expression profiles with missing values, and those calculated from the complete version of the same
data\

As we can see in Figure (#fig:missingdatacomp) GSVA scores calculated by skipping missing values
correlate better with those calculated from the complete data, than ssGSEA scores between incomplete
and complete data.

### Usage and benchmark with proteomics data

Here we show the usage of GSVA with the actual proteomics data from the referenced study, comparing
the results
obtained by skipping missing values with the results calculated from the imputed data. The
normalized proteomics expression values before imputation are stored in the `log2protexp` assay, and
after imputation in the `log2protexpimp` assay.

```r
assays(protExpCostaEtAl2021)$log2protexp[1:5, 1:5]
          BS03     BS05     BS06     BS07     BS08
5715  20.22729 20.97647       NA 20.42439 19.83030
9973        NA 18.31250       NA       NA       NA
5688  19.90413       NA       NA       NA       NA
10627       NA 21.41412       NA 20.38215       NA
8672  21.78837 21.60210 22.53073 22.16052 20.33004
assays(protExpCostaEtAl2021)$log2protexpimp[1:5, 1:5]
          BS03     BS05     BS06     BS07     BS08
5715  20.22729 20.97647 20.07473 20.42439 19.83030
9973  19.52460 18.31250 19.67240 18.96282 19.57746
5688  19.90413 20.61876 20.59096 21.51491 19.91715
10627 20.13780 21.41412 20.53676 20.38215 19.84890
8672  21.78837 21.60210 22.53073 22.16052 20.33004
```

We first create the parameter objects for the proteomics data before imputation.

```r
gsvapar <- gsvaParam(protExpCostaEtAl2021, c7.genesets.filt,
             assay="log2protexp", minSize=5, use="na.rm")
! Input expression data has NA values, which will be discarded from calculations
ssgseapar <- ssgseaParam(protExpCostaEtAl2021, c7.genesets.filt,
                 assay="log2protexp", minSize=5, use="na.rm")
! Input expression data has NA values, which will be discarded from calculations
```

We can use the method `anyNA()` on the parameter object to programmatically confirm anytime the
presence of missing values.

```r
anyNA(gsvapar)
[1] TRUE
anyNA(ssgseapar)
[1] TRUE
```

Next, we calculate enrichment scores skipping missing values.

```r
es_gsva <- gsva(gsvapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Calculating GSVA ranks
ℹ kcdf='auto' (default)
ℹ GSVA dense (classical) algorithm
ℹ Row-wise ECDF estimation with Gaussian kernels
ℹ Calculating row ECDFs
ℹ Calculating column ranks
ℹ Mapping identifiers
ℹ GSVA dense (classical) algorithm
ℹ Calculating GSVA scores for 36 gene sets
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
✔ Calculations finished
es_ssgsea <- gsva(ssgseapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Mapping identifiers
ℹ Calculating ssGSEA scores for 36 gene sets
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
! NA enrichment scores in gene sets with less than 5 genes after removing missing values
ℹ Normalizing ssGSEA scores
✔ Calculations finished
```

Now we do calculations again on the imputed proteomics data stored in the `log2protexpimp` assay.

```r
gsvapar <- gsvaParam(protExpCostaEtAl2021, c7.genesets.filt,
             assay="log2protexpimp", minSize=5)
anyNA(gsvapar)
[1] FALSE
es_gsva_imp <- gsva(gsvapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Calculating GSVA ranks
ℹ kcdf='auto' (default)
ℹ GSVA dense (classical) algorithm
ℹ Row-wise ECDF estimation with Gaussian kernels
ℹ Calculating row ECDFs
ℹ Calculating column ranks
ℹ Mapping identifiers
ℹ GSVA dense (classical) algorithm
ℹ Calculating GSVA scores for 36 gene sets
✔ Calculations finished
ssgseapar <- ssgseaParam(protExpCostaEtAl2021, c7.genesets.filt,
                 assay="log2protexpimp", minSize=5)
anyNA(ssgseapar)
[1] FALSE
es_ssgsea_imp <- gsva(ssgseapar)
ℹ GSVA version 2.6.3
ℹ Searching for rows with constant values
ℹ Mapping identifiers
ℹ Calculating ssGSEA scores for 36 gene sets
ℹ Normalizing ssGSEA scores
✔ Calculations finished
```

Finally, in a similar way we did in the previous section, we compare the enrichment scores
calculated before and after imputation. As shown in Figure (#fig:missingdatacomp2) below, GSVA
scores calculated by skipping missing values correlated better with those calculated from the
imputed data, than ssGSEA scores calculated by skipping missing values before imputation and on the
imputed data.

```r
r_es_gsva <- r_es_ssgsea <- numeric(nrow(es_gsva))
for (i in 1:nrow(es_gsva)) {
  r_es_gsva[i] <- cor(assay(es_gsva)[i, ], assay(es_gsva_imp)[i, ],
              use="complete.obs")
  r_es_ssgsea[i] <- cor(assay(es_ssgsea)[i, ], assay(es_ssgsea_imp)[i, ],
            use="complete.obs")
}
boxplot(list(GSVA=r_es_gsva, ssGSEA=r_es_ssgsea),
    ylab="Correlation before/after imputation", las=1)
```

normalized MS proteomics data before and after imputing missing values\
