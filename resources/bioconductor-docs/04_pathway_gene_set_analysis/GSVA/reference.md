# GSVA API reference

Generated from the canonical package `man/*.Rd` sources. Package version `2.7.10`; 24 reference
topics.

**Aliases:** `computeGeneSetsOverlap`, `computeGeneSetsOverlap,list,character-method`,
`computeGeneSetsOverlap,GeneSetCollection,character-method`

**Canonical source:** `repo/man/computeGeneSetsOverlap.Rd`

## `computeGeneSetsOverlap`: Compute gene-sets overlap

### Description

Calculates the overlap among every pair of gene-sets given as input.

This function calculates the overlap between every pair of gene sets of the input argument `gSets`.
Before this calculation takes place, the gene sets in `gSets` are firstly filtered to discard genes
that do not match to the identifiers in `uniqGenes`. Secondly, they are further filtered to meet the
minimum and/or maximum size specified with the arguments `minSize` and `maxSize`. The overlap
between two gene sets is calculated as the number of common genes between the two gene sets divided
by the smallest size of the two gene sets.

### Usage

```r
## S4 method for signature 'list,character'
computeGeneSetsOverlap(gSets, uniqGenes, minSize = 1, maxSize = Inf)

## S4 method for signature 'GeneSetCollection,character'
computeGeneSetsOverlap(gSets, uniqGenes, minSize = 1, maxSize = Inf)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gSets` | Gene sets given either as a `list` or a `GeneSetCollection` object. |
| `uniqGenes` | Vector of unique genes to be considered when calculating the overlaps. |
| `minSize` | Minimum size. |
| `maxSize` | Maximum size. |

### Value

A gene-set by gene-set matrix of the overlap among every pair of gene sets.

### See Also

`filterGeneSets`

### Examples

```r
geneSets <- list(set1=as.character(1:4), set2=as.character(4:10))
computeGeneSetsOverlap(geneSets, unique(unlist(geneSets)))
```

**Aliases:** `deduplicateGeneSets`

**Canonical source:** `repo/man/deduplicateGeneSets.Rd`

## `deduplicateGeneSets`: Handling of Duplicated Gene Set Names

### Description

Offers a choice of ways for handling duplicated gene set names that may not be suitable as input to
other gene set analysis functions.

### Usage

```r
deduplicateGeneSets(
  geneSets,
  deduplUse = c("first", "drop", "union", "smallest", "largest")
)
```

### Arguments

- `geneSets`: A named list of gene sets represented as character vectors of gene IDs as e.g.
 returned by
 `readGMT`.
- `deduplUse`: A character vector of length 1 specifying one of several methods to handle duplicated
 gene
 set names. Duplicated gene set names are explicitly forbidden by the [GMT file
 format
specification](https://software.broadinstitute.org/cancer/software/gsea/wiki/index.php/Data_formats)
but can nevertheless be encountered in the wild. The available choices
 are:
 - `first` (the default): drops all gene sets whose names are duplicated according to
 the base R function and retains only the first occurence of a gene set name.
 - `drop`: removes all gene sets that have a duplicated name, including its
 first occurrence.
 - `union`: replaces gene sets with duplicated names by a single gene set containing
 the union of all their gene IDs.
 - `smallest`: drops gene sets with duplicated names and retains only the smallest of
 them, i.e. the one with the fewest gene IDs. If there are several smallest gene sets, the first
will
 be selected.
 - `largest`: drops gene sets with duplicated names and retains only the largest of
 them, i.e. the one with the most gene IDs. If there are several largest gene sets, the first will
be
 selected.

### Value

A named list of gene sets represented as character vectors of gene IDs.

### Examples

```r
library(GSVA)

gsets <- list(gs1=LETTERS[1:3], gs2=LETTERS[4:6], gs2=LETTERS[5:8])
gsets

deduplicateGeneSets(gsets)
deduplicateGeneSets(gsets, deduplUse="drop")
deduplicateGeneSets(gsets, deduplUse="union")
deduplicateGeneSets(gsets, deduplUse="smallest")
deduplicateGeneSets(gsets, deduplUse="largest")

fname <- system.file("extdata", "c2.subsetdups.v7.5.symbols.gmt.gz",
                     package="GSVAdata")

## readGMT() calls internally deduplicateGeneSets() and it takes the
## parameter 'deduplUse' which is passed to the internal call
c2.dupgenesets <- readGMT(fname, deduplUse="union")
c2.dupgenesets
any(duplicated(names(c2.dupgenesets)))
```

**Aliases:** `filterGeneSets`, `filterGeneSets,list-method`,
`filterGeneSets,GeneSetCollection-method`

**Canonical source:** `repo/man/filterGeneSets.Rd`

## `filterGeneSets`: Filter gene sets

### Description

Filters gene sets through a given minimum and maximum set size.

This function filters the input gene sets according to a given minimum and maximum set size.

### Usage

```r
## S4 method for signature 'list'
filterGeneSets(gSets, minSize = 1, maxSize = Inf)

## S4 method for signature 'GeneSetCollection'
filterGeneSets(gSets, minSize = 1, maxSize = Inf)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gSets` | Gene sets given either as a `list` or a `GeneSetCollection` object. |
| `minSize` | Minimum size. |
| `maxSize` | Maximum size. |

### Value

A collection of gene sets that meet the given minimum and maximum set size.

### See Also

`computeGeneSetsOverlap`

### Examples

```r
geneSets <- list(set1=as.character(1:4), set2=as.character(4:10))
filterGeneSets(geneSets, minSize=5)
```

**Aliases:** `geneIdsToGeneSetCollection`

**Canonical source:** `repo/man/geneIdsToGeneSetCollection.Rd`

## `geneIdsToGeneSetCollection`: Construct a GeneSetCollection object from a list of character vectors

### Description

This function is essentially the reverse of `GSEABase::geneIds()`, i.e., it takes as input a named
list of `character` vectors representing gene sets and returns the corresponding GeneSetCollection
object.

### Usage

```r
geneIdsToGeneSetCollection(
  geneIdsList,
  geneIdType = "auto",
  collectionType = NullCollection()
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneIdsList` | A named list of character vectors like the ones returned by `geneIds()`. Names must be unique; otherwise see `deduplicateGeneSets()` for a number of strategies to resolve this issue. |
| `geneIdType` | By default a character vector of length 1 with the special value `"auto"` or an object of a subclass of `GeneIdentifierType`. If set to `"auto"`, the function will try to derive the gene ID type from argument `geneIdsList` using `guessGeneIdType`. Other values, including `NULL`, will be ignored with a warning and `geneIdType=NullIdentifier()` will be used instead. The gene ID type of all `GeneSet` objects in the resulting `GeneSetCollection` will be set to this value. |
| `collectionType` | An object of class `CollectionType`. The collection type of all `GeneSet` objects in the resulting `GeneSetCollection` will be set to this value but can afterwards be modified for individual `GeneSet`s if necessary. |

### Value

An object of class `GeneSetCollection` with all its `GeneSet` objects using the gene ID and
collection types specified by the corresponding arguments. Applying function `geneIds()` to this
object should return a list identical to the `geneIdsList` argument.

### See Also

`GeneSetCollection`, `GeneIdentifierType`, `geneIds`, `deduplicateGeneSets`, `guessGeneIdType`,
`GeneSet`

### Examples

```r
library(GSVA)

gsets <- list(INNATE_RESPONSE=c("AIM2", "ALPK1", "AP3B1"),
              ADAPTIVE_RESPONSE=c("CD27", "CD70", "EBAG9"))
gsets
geneIdsToGeneSetCollection(gsets)
```

**Aliases:** `geneSets`, `geneSetSizes`, `geneSets,GsvaMethodParam-method`,
`geneSets,SummarizedExperiment-method`, `geneSets,SingleCellExperiment-method`,
`geneSets,SpatialExperiment-method`, `geneSets,GsvaExprData-method`,
`geneSetSizes,GsvaMethodParam-method`, `geneSetSizes,GsvaExprData-method`

**Canonical source:** `repo/man/geneSets.Rd`

## `geneSets`: Retrieve or Determine Gene Sets

### Description

Retrieves or determines the gene sets that have been used or would be used in a `gsva()` gene set
analysis. These are not necessarily the same as the input gene sets. See Details.

### Usage

```r
## S4 method for signature 'GsvaMethodParam'
geneSets(obj)

## S4 method for signature 'SummarizedExperiment'
geneSets(obj)

## S4 method for signature 'SingleCellExperiment'
geneSets(obj)

## S4 method for signature 'SpatialExperiment'
geneSets(obj)

## S4 method for signature 'GsvaExprData'
geneSets(obj)

## S4 method for signature 'GsvaMethodParam'
geneSetSizes(obj)

## S4 method for signature 'GsvaExprData'
geneSetSizes(obj)
```

### Arguments

- `obj`: An object of one of the following classes:
 - An expression data object of one of the classes described in `GsvaExprData` that
 is the return value of a call to `gsva()`.
 - A parameter object of one of the classes described in `GsvaMethodParam` that could
 be used in a call to `gsva()`.

### Details

The gene sets used in a `gsva()` gene set analysis, or just their sizes, may be a valuable input to
subsequent analyses. However, they are not necessarily the same as the original input gene sets, or
their sizes: based on user choices, the gene annotation used, or presence/absence of genes in gene
sets and expression data set, `gsva()` may have to modify them during the preparation of an analysis
run. In order to make use of these gene sets or their sizes, you can either

- retrieve them from the object returned by `gsva()` by passing this object to `geneSets()` or
 `geneSetSizes()`, or

- predict them by calling `geneSets()` or `geneSetSizes()` on the parameter object that would also
 be passed to `gsva()`. This is much slower and should only be done if you do not intend to run an
 actual gene set analysis.

`geneSetSizes()` is a convenience wrapper running `lengths()` on the list of gene sets returned by
`geneSets()`.

### Value

The `geneSets()` methods return a named list of character vectors where each character vector
contains the gene IDs of a gene set. The `geneSetSizes()` methods return a named integer vector of
gene set sizes.

### Examples

```r
library(GSVA)

p <- 10 ## number of genes
n <- 30 ## number of samples

gsets <- list(set1=paste0("g", 1:3),
              set2=paste0("g", 4:6),
              set3=paste0("g", 7:10),
              set4=paste0("g", 10:13)) ## genes not in the expression data
gsets

y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

gsvapar <- gsvaParam(y, gsets)
geneSets(gsvapar)

es <- gsva(gsvapar)

geneSets(es)
```

**Aliases:** `GSVA-pkg-defunct`

**Canonical source:** `repo/man/GSVA-pkg-defunct.Rd`

## `GSVA-pkg-defunct`: Defunct functions in package `GSVA`.

### Description

The functions listed below are defunct and will be removed in the next release.

**Aliases:** `GSVA-pkg-deprecated`, `gsvaRanks`, `gsvaRanks,gsvaParam-method`, `gsvaScores`,
`gsvaScores,gsvaRanksParam-method`, `saveHDF5GSVAranks`, `loadHDF5GSVAranks`

**Canonical source:** `repo/man/GSVA-pkg-deprecated.Rd`

## `GSVA-pkg-deprecated`: Deprecated functions in package `GSVA`.

### Description

The functions listed below are deprecated and will be defunct in the near future. When possible,
alternative functions with similar functionality are also mentioned.

The `gsvaRanks()` method is deprecated. Please use `gsvaRowNorm()` and `gsvaColRanks()` instead.

The `gsvaScores()` method is deprecated. Please use `gsvaColScores()` instead.

The `saveHDF5GSVAranks()` function is deprecated. Please use `saveHDF5GSVA()` instead.

The `loadHDF5GSVAranks()` function is deprecated. Please use `loadHDF5GSVA()` instead.

### Usage

```r
## S4 method for signature 'gsvaParam'
gsvaRanks(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

## S4 method for signature 'gsvaRanksParam'
gsvaScores(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

saveHDF5GSVAranks(rankExprData, dir, ...)

loadHDF5GSVAranks(dir, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `param` | A parameter object of the `gsvaRanksParam` class. |
| `rankExprData` | A column-rank expression data set obtained with `gsvaColRanks`. Must be one of the classes supported by `GsvaExprData`. For a list of these classes, see its help page using `help(GsvaExprData)`. |
| `dir` | The path to the directory where to save or load the GSVA rank values. |
| `...` | Additional arguments to be passed to the underlying HDF5 saving/loading functions `saveHDF5SummarizedExperiment` and `loadHDF5SummarizedExperiment`, respectively. |

### Value

For `saveHDF5GSVAranks()`, the path to the directory where the data has been saved is returned
invisibly. For `loadHDF5GSVAranks()`, an object is returned containing the corresponding loaded GSVA
row-normalized or rank expression values, and their corresponding metadata. If the saved GSVA output
was originally stored in a `SummarizedExperiment` object or one of its derived classes, then the
returned object will be a `SummarizedExperiment`. Otherwise, the returned object will be a
`DelayedMatrix` object.

**Aliases:** `saveHDF5GSVA`, `loadHDF5GSVA`

**Canonical source:** `repo/man/gsva-serialization.Rd`

## `saveHDF5GSVA`: Save/load GSVA output to disk using HDF5 format

### Description

The functions `saveHDF5GSVA()` and `loadHDF5GSVA()` allow one to save and load the output from GSVA
to/from disk. The `saveHDF5GSVA()` function takes the output of `gsvaRowNorm` or `gsvaColRanks` as
input, and saves the output from these methods with the relevant metadata to a specified directory.
The `loadHDF5GSVA()` function reads the saved data from the specified directory and returns an
object with the corresponding GSVA row-normalized or rank expression values, and their corresponding
metadata.

### Usage

```r
saveHDF5GSVA(gsvaExprData, dir, assay = "auto", ...)

loadHDF5GSVA(dir, assay = "auto", ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gsvaExprData` | An object obtained with `gsvaRowNorm` or `gsvaColRanks`. Must be one of the classes supported by `GsvaExprData`. For a list of these classes, see its help page using `help(GsvaExprData)`. |
| `dir` | The path to the directory where to save or load the GSVA output data. |
| `assay` | A single character string specifying the assay that contains the GSVA output to be saved or loaded. By default, `assay="auto"`, which in the case of saving and a `gsvaExprData` object that is a `SummarizedExperiment` or one of its derivatives, it will look for an assay named `gsvaranks`, and if not found, it will look for an assay named `gsvarnorm`. If `gsvaExprData` is not a `SummarizedExperiment` or one of its derivatives, then the assay to be saved will be determined by the `assay` attribute of the `gsvaExprData` object. |
| `...` | Additional arguments to be passed to the underlying HDF5 saving/loading functions `saveHDF5SummarizedExperiment` and `loadHDF5SummarizedExperiment`, respectively. |

### Value

For `saveHDF5GSVA()` the path to the directory where the data has been saved is returned invisibly.
For `loadHDF5GSVA()`, an object is returned containing the corresponding loaded GSVA row-normalized
or rank expression values, and their corresponding metadata. If the saved GSVA output was originally
stored in a `SummarizedExperiment` object or one of its derived classes, then the returned object
will be a `SummarizedExperiment`. Otherwise, the returned object will be a `DelayedMatrix` object.

### Examples

```r
p <- 10 ## number of genes
n <- 30 ## number of samples
nGrp1 <- 15 ## number of samples in group 1
nGrp2 <- n - nGrp1 ## number of samples in group 2

## consider three disjoint gene sets
geneSets <- list(gset1=paste0("g", 1:3),
                 gset2=paste0("g", 4:6),
                 gset3=paste0("g", 7:10))

## sample data from a normal distribution with mean 0 and st.dev. 1
y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

## build GSVA parameter object
gsvapar <- gsvaParam(y, geneSets)

## calculate row-normalized expression values
gsvarownorm <- gsvaRowNorm(gsvapar)

## calculate GSVA column ranks
gsvacolranks <- gsvaColRanks(gsvarownorm)

## calculate GSVA scores
es <- gsvaColScores(gsvacolranks)

## save the GSVA row-normalized expression values to disk
rnormdir <- tempfile()
saveHDF5GSVA(gsvarownorm, rnormdir)

## save the GSVA rank values to disk
ranksdir <- tempfile()
saveHDF5GSVA(gsvacolranks, ranksdir)

## load the GSVA row-normalized values from disk
loaded_gsvarownorm <- loadHDF5GSVA(rnormdir)

## check that the loaded row-normalized values provide the
## same ranks as the ones calculated from the original values
gsvacolranks_from_loaded_gsvarownorm <- gsvaColRanks(loaded_gsvarownorm)

identical(gsvacolranks, gsvacolranks_from_loaded_gsvarownorm)

## load the GSVA ranks from disk
loaded_gsvacolranks <- loadHDF5GSVA(ranksdir)

## check that the loaded ranks provide the
## same scores as the original ranks
loaded_es <- gsvaColScores(loaded_gsvacolranks)
identical(es, loaded_es)
```

**Aliases:** `gsva`, `gsva,gsvaParam-method`, `gsva,plageParam-method`, `gsva,ssgseaParam-method`,
`gsva,zscoreParam-method`

**Canonical source:** `repo/man/gsva.Rd`

## `gsva`: Gene Set Variation Analysis

### Description

Estimates GSVA enrichment scores.

### Usage

```r
## S4 method for signature 'gsvaParam'
gsva(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

## S4 method for signature 'plageParam'
gsva(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

## S4 method for signature 'ssgseaParam'
gsva(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

## S4 method for signature 'zscoreParam'
gsva(
  param,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)
```

### Arguments

- `param`: A parameter object of one of the following classes:
 - A `gsvaParam` object built using the constructor function `gsvaParam`.
 This object will trigger `gsva()` to use the GSVA algorithm by Hänzelmann et al.
 (2013).
 - A `plageParam` object built using the constructor function
 `plageParam`. This object will trigger `gsva()` to use the PLAGE algorithm by
 Tomfohr et al. (2005).
 - A `zscoreParam` object built using the constructor function
 `zscoreParam`. This object will trigger `gsva()` to use the combined z-score
 algorithm by Lee et al. (2008).
 - A `ssgseaParam` object built using the constructor function
 `ssgseaParam`. This object will trigger `gsva()` to use the ssGSEA algorithm
 by Barbie et al. (2009).
- `verbose`: Gives information about each calculation step. Default: `TRUE`.
- `BPPARAM`: An object of class `BiocParallelParam` specifying parameters related to the
 parallel execution of some of the tasks and calculations within this function.
- `maxmem`: A vector of length 1 either specifying a number in bytes, or a character string with
 either
 the word `auto` (default), or a number followed by a suffix indicating kilobytes (K),
 megabytes (M), gigabytes (G) or terabytes (T), which GSVA will use to attempt bounding the maximum
 amount of main memory used across all threads of execution to that given quantity. By default
 `maxmem="auto"`, indicating that the maximum memory will be the 90% of the total main
 memory, as calculated by `Sys.meminfo()`. To avoid setting any bound on the maximum
 memory, use `maxmem=Inf`. Note that the amount of main memory used in an R session or
 script may depend on other commands and packages used in that same session or script.

### Value

A gene-set by sample matrix of GSVA enrichment scores stored in a container object of the same type
as the input expression data container, except for the fact that enrichment scores are always dense,
irrespective of whether the input is sparse, such as in single-cell data. If the input was a base
matrix, a `dgCMatrix`, a `SVT_SparseMatrix`, or a `DelayedMatrix` object, then the output will be
either a base matrix object or a `DelayedMatrix`, with the gene sets employed in the calculations
stored in an attribute called `geneSets` of that object. If the input was an `ExpressionSet` object,
then the output will be also an `ExpressionSet` object with the gene sets employed in the
calculations stored in an attribute called `geneSets`. If the input was an object of either class
`SummarizedExperiment`, `SingleCellExperiment`, or `SpatialExperiment`, then the output will be of
the same class, where enrichment scores will be stored in an assay called `es` and the gene sets
employed in the calculations will be stored in the `rowData` slot of the object under the column
name `gs`.

### See Also

`gsvaParam`, `plageParam`, `zscoreParam`, `ssgseaParam`, `BiocParallelParam`, `gsvaRowNorm`,
`gsvaColRanks`, `gsvaColScores`

### Examples

```r
library(GSVA)
library(limma)

p <- 10 ## number of genes
n <- 30 ## number of samples
nGrp1 <- 15 ## number of samples in group 1
nGrp2 <- n - nGrp1 ## number of samples in group 2

## consider three disjoint gene sets
geneSets <- list(set1=paste("g", 1:3, sep=""),
                 set2=paste("g", 4:6, sep=""),
                 set3=paste("g", 7:10, sep=""))

## sample data from a normal distribution with mean 0 and st.dev. 1
y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

## genes in set1 are expressed at higher levels in the last 'nGrp1+1' to 'n' samples
y[geneSets$set1, (nGrp1+1):n] <- y[geneSets$set1, (nGrp1+1):n] + 2

## build design matrix
design <- cbind(sampleGroup1=1, sampleGroup2vs1=c(rep(0, nGrp1), rep(1, nGrp2)))

## fit linear model
fit <- lmFit(y, design)

## estimate moderated t-statistics
fit <- eBayes(fit)

## genes in set1 are differentially expressed
topTable(fit, coef="sampleGroup2vs1")

## build GSVA parameter object
gsvapar <- gsvaParam(y, geneSets)

## estimate GSVA enrichment scores for the three sets
gsva_es <- gsva(gsvapar)

## fit the same linear model now to the GSVA enrichment scores
fit <- lmFit(gsva_es, design)

## estimate moderated t-statistics
fit <- eBayes(fit)

## set1 is differentially expressed
topTable(fit, coef="sampleGroup2vs1")
```

**Aliases:** `gsvaAnnotation`, `gsvaAnnotation<-`, `gsvaAnnotation,GsvaExprData-method`,
`gsvaAnnotation<-,GsvaExprData,GeneIdentifierType-method`, `gsvaAnnotation,ExpressionSet-method`,
`gsvaAnnotation<-,ExpressionSet,character-method`,
`gsvaAnnotation<-,ExpressionSet,GeneIdentifierType-method`,
`gsvaAnnotation,SummarizedExperiment-method`,
`gsvaAnnotation<-,SummarizedExperiment,GeneIdentifierType-method`,
`gsvaAnnotation,SingleCellExperiment-method`,
`gsvaAnnotation<-,SingleCellExperiment,GeneIdentifierType-method`,
`gsvaAnnotation,SpatialExperiment-method`,
`gsvaAnnotation<-,SpatialExperiment,GeneIdentifierType-method`, `gsvaAnnotation,list-method`,
`gsvaAnnotation<-,list,GeneIdentifierType-method`, `gsvaAnnotation,GeneSetCollection-method`

**Canonical source:** `repo/man/gsvaAnnotation.Rd`

## `gsvaAnnotation`: Store and Retrieve Annotation Metadata

### Description

Methods for storing and retrieving annotation metadata in expression data objects that support it.
If gene sets and expression data are using different but known gene identifier types and an
appropriate annotation database is available, gene set identifiers can be mapped to expression data
identifiers without manual user intervention, e.g. from an MSigDb gene set using ENTREZ IDs or gene
symbols to an expression data set using ENSEMBL IDs.

### Usage

```r
## S4 method for signature 'GsvaExprData'
gsvaAnnotation(object)

## S4 replacement method for signature 'GsvaExprData,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'ExpressionSet'
gsvaAnnotation(object)

## S4 replacement method for signature 'ExpressionSet,character'
gsvaAnnotation(object) <- value

## S4 replacement method for signature 'ExpressionSet,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'SummarizedExperiment'
gsvaAnnotation(object)

## S4 replacement method for signature 'SummarizedExperiment,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'SingleCellExperiment'
gsvaAnnotation(object)

## S4 replacement method for signature 'SingleCellExperiment,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'SpatialExperiment'
gsvaAnnotation(object)

## S4 replacement method for signature 'SpatialExperiment,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'list'
gsvaAnnotation(object)

## S4 replacement method for signature 'list,GeneIdentifierType'
gsvaAnnotation(object) <- value

## S4 method for signature 'GeneSetCollection'
gsvaAnnotation(object)
```

### Arguments

| Argument | Description |
| --- | --- |
| `object` | An expression data object of one of the classes described in `GsvaExprData`. Simple `matrix` and `dgCMatrix` objects are not capable of storing annotation metadata and will return `NULL`. |
| `value` | For the replacement methods, the annotation metadata to be stored in the object. For `ExpressionSet` objects, this must be a character of length 1 specifying the name of the annotation database to be used. For `SummarizedExperiment` and its subclasses, this must be a `GeneIdentifierType` created by one of the constructors from package `GSEABase` where the `annotation` argument is typically the name of an organism or annotation database, e.g. `org.Hs.eg.db`. Simple `matrix` and `dgCMatrix` objects are not capable of storing annotation metadata and the attempt to do so will result in an error. |

### Value

For the retrieval methods, the annotation metadata stored in the object or `NULL`. For the
replacement methods, the updated object.

### See Also

`ExpressionSet`, `SummarizedExperiment`, `GeneIdentifierType`, `dgCMatrix`

### Examples

```r
library(GSEABase)
library(GSVA)
library(GSVAdata)

data(geneprotExpCostaEtAl2021)
se <- geneExpCostaEtAl2021
se

gsvaAnnotation(se)
gsvaAnnotation(se) <- EntrezIdentifier("org.Hs.eg.db")
gsvaAnnotation(se)
```

**Aliases:** `gsvaEnrichment`

**Canonical source:** `repo/man/gsvaEnrichment.Rd`

## `gsvaEnrichment`: GSVA enrichment data and visualization

### Description

Extract and plot enrichment data from GSVA scores.

### Usage

```r
gsvaEnrichment(
  rankExprData,
  column = 1,
  geneSet = 1,
  plot = c("auto", "base", "ggplot", "no"),
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `rankExprData` | A column-rank expression data set obtained with `gsvaColRanks`. Must be one of the classes supported by `GsvaExprData`. For a list of these classes, see its help page using `help(GsvaExprData)`. |
| `column` | The column for which we want to retrieve the enrichment data. This parameter is only available in the `gsvaEnrichment()` method. |
| `geneSet` | Either a single positive integer number between 1 and the number of available gene sets in parameter object stored in `rankExprData`, or a single character string with the name of one of the gene sets available in that object, or a vector of integers or character strings with the index values or names of rows in `rankExprData` that should be considered as the gene set for which the enrichment data should be retrieved. |
| `plot` | A character string indicating whether an enrichment plot should be produced using either base R graphics (`plot="base"`) or the ggplot2 package (`plot="ggplot"`), or not (`plot="no"`). In the latter case, the enrichment data will be returned. By default `plot="auto"`, which implies that if this method is called from an interactive session, a plot using base R graphics will be produced and, otherwise, the enrichment data is returned. |
| `...` | Further arguments passed to the `plot()` function when the previous parameter `plot="base"`. |

### Value

When `plot="no"`, this method returns the enrichment data. When `plot="ggplot"`, this method returns
a `ggplot` object. When `plot="base"` no value is returned.

### See Also

`gsvaColRanks`, `GsvaExprData`

### Examples

```r
library(GSVA)

p <- 10 ## number of genes
n <- 30 ## number of samples
nGrp1 <- 15 ## number of samples in group 1
nGrp2 <- n - nGrp1 ## number of samples in group 2

## consider three disjoint gene sets
geneSets <- list(gset1=paste0("g", 1:3),
                 gset2=paste0("g", 4:6),
                 gset3=paste0("g", 7:10))

## sample data from a normal distribution with mean 0 and st.dev. 1
y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

## build GSVA parameter object
gsvapar <- gsvaParam(y, geneSets)

## calculate GSVA ranks
gsvarownorm <- gsvaRowNorm(gsvapar)
gsvaranks <- gsvaColRanks(gsvarownorm)

## by default the enrichment data for the first column and the first
## gene set in the input parameter object, are retrieved
gsvaEnrichment(gsvaranks)

## we can calculate the enrichment data for any of the gene sets given
## in the input parameter object
gsvaEnrichment(gsvaranks, geneSet="gset2")

## we can calculate the enrichment data for a new gene set that did not
## form part of the input parameter object
gsvaEnrichment(gsvaranks, geneSet=c("g1", "g4", "g7"))
```

**Aliases:** `GsvaExprData-class`, `GsvaExprData`

**Canonical source:** `repo/man/GsvaExprData-class.Rd`

## `GsvaExprData-class`: `GsvaExprData` class

### Description

Virtual superclass of expression data classes supported by `GSVA`.

### Details

`GSVA` supports expression data matrices in a growing number of containers and representations. This
class union allows to store any of these in a slot of another class as well as defining common
methods for all of them. The current list of supported classes is:

- `matrix`

- `dgCMatrix` from package `Matrix`

- `SVT_SparseMatrix` from package `SparseArray`

- `DelayedMatrix` from package `DelayedArray`

- `HDF5Matrix` from package `HDF5Array`

- `ExpressionSet` from package `Biobase`

- `SummarizedExperiment` from package `SummarizedExperiment`

- `SingleCellExperiment` from package `SingleCellExperiment`

- `SpatialExperiment` from package `SpatialExperiment`

### See Also

`matrix`, `dgCMatrix`, `SVT_SparseMatrix`, `DelayedMatrix`, `HDF5Array`, `ExpressionSet`,
`SummarizedExperiment`, `SingleCellExperiment`, `SpatialExperiment`

**Aliases:** `GsvaGeneSets-class`

**Canonical source:** `repo/man/GsvaGeneSets-class.Rd`

## `GsvaGeneSets-class`: `GsvaGeneSets` class

### Description

Virtual superclass of gene set classes supported by `GSVA`.

### Details

`GSVA` supports gene sets consisting of gene identifiers as either a named list of character vectors
or an object of class `GeneSetCollection`. Alternatively, gene sets may be specified as a named list
of integer vectors in the range of 1:nrow(X) that are indices to the rows of the corresponding
expression data matrix X. This class union allows to store any of these in a slot of another class
as well as defining common methods for them.

### See Also

`list`, `GeneSetCollection`

### Examples

```r
library(GSVA)

gsetslst <- list(INNATE_RESPONSE=c("AIM2", "ALPK1", "AP3B1"),
                 ADAPTIVE_RESPONSE=c("CD27", "CD70", "EBAG9"))
gsetslst
gsetsgsc <- geneIdsToGeneSetCollection(gsetslst)
gsetsgsc

class(gsetslst)
class(gsetsgsc)
is(gsetslst, "GsvaGeneSets")
is(gsetsgsc, "GsvaGeneSets")

```

**Aliases:** `GsvaMethodParam-class`, `details,GsvaMethodParam-method`, `details,gsvaParam-method`,
`details,ssgseaParam-method`

**Canonical source:** `repo/man/GsvaMethodParam-class.Rd`

## `GsvaMethodParam-class`: `GsvaMethodParam` class

### Description

Virtual superclass of method parameter classes supported by `GSVA`.

A virtual superclass of the `GSVA` packages' method-specific parameter classes. The method
'details()' provides a detailed summary of the parameter values stored in this class and its
subclasses.

### Usage

```r
## S4 method for signature 'GsvaMethodParam'
details(object)

## S4 method for signature 'gsvaParam'
details(object)

## S4 method for signature 'ssgseaParam'
details(object)
```

### Arguments

| Argument | Description |
| --- | --- |
| `object` | An object of class `GsvaMethodParam` or one of its subclasses. |

### Details

`GSVA` implements four single-sample gene set analysis methods: PLAGE, combined z-scores, ssGSEA,
and GSVA. All of them take at least an expression data matrix and one or more gene sets as input.
Further common parameters include an assay name for use with multi-assay expression data containers,
the gene ID type used by the expression data set, and a minimum and maximum size for gene sets to
limit the range of gene set sizes used in an analysis. This virtual class provides the necessary
slots for this shared parameter set and serves as the parent class for all `GSVA` method parameter
classes.

The `GSVA` package implements four single-sample gene set analysis methods (PLAGE, combined
z-scores, ssGSEA, and GSVA) and a respective method-specific parameter class that is used to invoke
each of them with a matching set of parameters.

### Slots

`exprData`
The expression data set. Must be one of the classes supported by `GsvaExprData`. For a list of these
classes, see its help page using `help(GsvaExprData)`.

`geneSets`
The gene sets. Must be one of the classes supported by `GsvaGeneSets`. For a list of these classes,
see its help page using `help(GsvaGeneSets)`.

`assay`
Character vector of length 1. The name of the assay to use in case `exprData` is a multi-assay
container, otherwise ignored. By default, the first assay is used.

`annotation`
An object of class `GeneIdentifierType` from package `GSEABase` describing the gene identifiers used
as the row names of the expression data set. See `GeneIdentifierType` for help on available gene
identifier types and how to construct them. This information can be used to map gene identifiers
occurring in the gene sets. By default, this slot has value `NullIdentifier` and gene identifiers
used in expression data set and gene sets are matched directly.

`minSize`
Numeric vector of length 1. Minimum size of the resulting gene sets after gene identifier mapping.
By default, the minimum size is 1.

`maxSize`
Numeric vector of length 1. Maximum size of the resulting gene sets after gene identifier mapping.
By default, the maximum size is `Inf`.

`nzcount`
Numeric vector of length 1. Number of non-zero values in the selected assay, if there is more than
one, of the 'exprData' slot.

`ondisk`
Character vector of length 1 denoting whether an on-disk backend should be used to reduce the memory
footprint. The default value `ondisk="auto"` will attempt to load all the data in main memory when
the input nonzero values fit in main memory, otherwise it will attempt working with an on-disk data
structure that reduces de memory footprint. When `ondisk="yes"` it will attempt to work with an
on-disk data structure, while when `ondisk="no"` it will attempt to load all the data in main
memory.

### See Also

`GsvaExprData`, `GsvaGeneSets`, `zscoreParam`, `plageParam`, `ssgseaParam`, `gsvaParam`,
`GeneIdentifierType`

`plageParam`, `zscoreParam`, `ssgseaParam`, `gsvaParam`

### Examples

```r
library(GSVA)

p <- 10 ## number of genes
n <- 30 ## number of samples

gsets <- list(set1=paste0("g", 1:3),
              set2=paste0("g", 4:6),
              set3=paste0("g", 7:10),
              set4=paste0("g", 10:13)) ## genes not in the expression data
gsets

y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

gsvapar <- gsvaParam(y, gsets)

class(gsvapar)
is(gsvapar, "GsvaMethodParam")
```

**Aliases:** `gsvaParam-class`, `gsvaRanksParam-class`, `gsvaParam`,
`geneSets<-,gsvaParam,GsvaGeneSets-method`, `geneSets<-`, `anyNA,gsvaParam-method`

**Canonical source:** `repo/man/gsvaParam-class.Rd`

## `gsvaParam-class`: `gsvaParam` class

### Description

S4 class for GSVA method parameter objects.

Objects of class `gsvaParam` contain the parameters for running the `GSVA` method.

### Usage

```r
gsvaParam(
  exprData,
  geneSets,
  assay = NA_character_,
  annotation = NULL,
  minSize = 1,
  maxSize = Inf,
  kcdf = c("auto", "Gaussian", "Poisson", "none"),
  kcdfNoneMinSampleSize = 200,
  tau = 1,
  maxDiff = TRUE,
  absRanking = FALSE,
  sparse = TRUE,
  checkNA = c("auto", "yes", "no"),
  use = c("everything", "all.obs", "na.rm"),
  filterRows = TRUE,
  ondisk = c("auto", "yes", "no"),
  verbose = TRUE
)

## S4 replacement method for signature 'gsvaParam,GsvaGeneSets'
geneSets(object) <- value

## S4 method for signature 'gsvaParam'
anyNA(x, recursive = FALSE)
```

### Arguments

- `exprData`: The expression data set. Must be one of the classes supported by `GsvaExprData`.
 For a list of these classes, see its help page using `help(GsvaExprData)`.
- `geneSets`: The gene sets. Must be one of the classes supported by `GsvaGeneSets`. For a list
 of these classes, see its help page using `help(GsvaGeneSets)`.
- `assay`: Character vector of length 1. The name of the assay to use in case `exprData` is a
 multi-assay container, otherwise ignored. By default, an assay called 'logcounts' will be used if
 present, otherwise the first assay is used.
- `annotation`: An object of class `GeneIdentifierType` from package `GSEABase`
 describing the gene identifiers used as the row names of the expression data set. See
 `GeneIdentifierType` for help on available gene identifier types and how to construct
 them. This information can be used to map gene identifiers occurring in the gene sets.
 If the default value `NULL` is provided, an attempt will be made to extract the gene
 identifier type from the expression data set provided as `exprData` (by calling
 `gsvaAnnotation` on it). If still not successful, the `NullIdentifier()` will
 be used as the gene identifier type, gene identifier mapping will be disabled and gene identifiers
 used in expression data set and gene sets can only be matched directly.
- `minSize`: Numeric vector of length 1. Minimum size of the resulting gene sets after gene
 identifier
 mapping. By default, the minimum size is 1.
- `maxSize`: Numeric vector of length 1. Maximum size of the resulting gene sets after gene
 identifier
 mapping. By default, the maximum size is `Inf`.
- `kcdf`: Character vector of length 1 denoting the kernel to use during the non-parametric
 estimation
 of the empirical cumulative distribution function (ECDF) of expression levels across samples. The
 value `kcdf="auto"` will allow GSVA to automatically choose one of the possible values.
 The value `kcdf="Gaussian"` is suitable when input expression values are continuous, such
 as microarray fluorescent units in logarithmic scale, RNA-seq log-CPMs, log-RPKMs, or log-TPMs.
When
 input expression values are integer counts, such as those derived from RNA-seq experiments, then
 this argument should be set to `kcdf="Poisson"`. When we do not want to use a kernel
 approach for the estimation of the ECDF, then we should set `kcdf="none"`.
- `kcdfNoneMinSampleSize`: Integer vector of length 1. When `kcdf="auto"`, this parameter decides at
 what
 minimum sample size `kcdf="none"`, i.e., the estimation of the empirical cumulative
 distribution function (ECDF) of expression levels across samples is performed directly without
using
 a kernel. By default, this value is set to 200; see the `kcdf` slot.
- `tau`: Numeric vector of length 1. The exponent defining the weight of the tail in the random walk
 performed by the `GSVA` (Hänzelmann et al., 2013) method. The default value is 1 as
 described in the paper.
- `maxDiff`: Logical vector of length 1 which offers two approaches to calculate the enrichment
 statistic
 (ES) from the KS random walk statistic.
 - `FALSE`: ES is calculated as the maximum distance of the random walk from 0. This
 approach produces a distribution of enrichment scores that is bimodal, but it can give large
 enrichment scores to gene sets whose genes are not concordantly activated in one direction
 only.
 - `TRUE` (the default): ES is calculated as the magnitude difference between the
 largest positive and negative random walk deviations. This default value gives larger enrichment
 scores to gene sets whose genes are concordantly activated in one direction only.
- `absRanking`: Logical vector of length 1 used only when `maxDiff=TRUE`. When
 `absRanking=FALSE` (default) a modified Kuiper statistic is used to calculate enrichment
 scores, taking the magnitude difference between the largest positive and negative random walk
 deviations. When `absRanking=TRUE` the original Kuiper statistic that sums the largest
 positive and negative random walk deviations is used.
- `sparse`: Logical vector of length 1 used only when the input expression data in `exprData`
 is stored in a sparse matrix (e.g., a `dgCMatrix` or a `SingleCellExperiment`
 object storing the expression data in a `dgCMatrix`). In such a case, when
 `sparse=TRUE` (default), a sparse version of the GSVA algorithm will be applied.
 Otherwise, when `sparse=FALSE`, the classical version of the GSVA algorithm will be
 used.
- `checkNA`: Character vector of length 1 specifying whether the input expression data should be
 checked
 for the presence of missing values (`NA` or `NaN`). This must be one of the
 strings `"auto"` (default), `"yes"`, or `"no"`. The default value
 `"auto"` means that the software will perform that check only when the input expression
 data is provided as a base `matrix`, an `ExpressionSet` or a
 `SummarizedExperiment` object, while every other type of input expression data container
 (e.g., `SingleCellExperiment`, etc.) will not be checked. If `checkNA="yes"`,
 then the input expression data will be checked for missing values irrespective of the object class
 of the data container, and if `checkNA="no"`, then that check will not be
 performed.
- `use`: Character vector of length 1 specifying a policy for dealing with missing values
 (`NA` or `NaN`) in the input expression data argument `exprData`.
 It only applies when either `checkNA="yes"`, or `checkNA="auto"` (see the
 `checkNA` parameter. The argument value must be one of the strings
 `"everything"` (default), `"all.obs"`, or `"na.rm"`. The policy of
 the default value `"everything"` consists of propagating missing values so that the
 resulting enrichment score will be `NA`, whenever one or more of its contributing values
 is missing, giving a warning when that happens. When `use="all.obs"`, the presence of
 `NA`s in the input expression data will produce an error. Finally, when
 `use="na.rm"`, missing values in the input expression data will be removed from
 calculations, giving a warning when that happens, and giving an error if no values are left after
 removing the missing values.
- `filterRows`: Logical vector of length 1, indicating whether the rows in, the input expression
 data,
 typically corresponding to transcripts, genes or proteins, should be filtered for constant
 expression across columns, typically corresponding to samples or cells, with respect to all
 available (nonmissing) values and to the non-zero values. By default, this slot is set to
 `TRUE` and the user may set it to `FALSE` when there is absolute certainty
 that no such rows exist in the input expression data, since this may save running time, especially
 with data sets with hundreds of thousands or millions of columns.
- `ondisk`: Character vector of length 1 denoting whether an on-disk backend should be used to
 reduce the
 memory footprint. The default value `ondisk="auto"` will attempt to load all the data in
 main memory when the input nonzero values fit in main memory, otherwise it will attempt working
with
 an on-disk data structure that reduces de memory footprint. When `ondisk="yes"` it will
 attempt to work with an on-disk data structure, while when `ondisk="no"` it will attempt
 to load all the data in main memory.
- `verbose`: Logical vector of length 1. It gives information about some decisions made by the
 software
 during parameter object construction when `verbose=TRUE` (default) and remains silent
 otherwise.
- `object`: For the replacement method, an object of class `gsvaParam`.
- `value`: For the replacement method, an object of the classes supported by
 `GsvaGeneSets`.
- `x`: An object of class `gsvaParam`.
- `recursive`: Not used with `x` being an object of class `gsvaParam`.

### Details

In addition to the common parameter slots inherited from `[GsvaMethodParam]`, this class has slots
for a number of method-specific parameters of the GSVA method described below.

In addition to a number of parameters shared with all methods implemented by package GSVA, `GSVA`
takes six method-specific parameters. All of these parameters are described in detail below.

### Value

A new `gsvaParam` object.

### Slots

`kcdf`
Character vector of length 1 denoting the kernel to use during the non-parametric estimation of the
empirical cumulative distribution function (ECDF) of expression levels across samples. The value
`kcdf="auto"` will allow GSVA to automatically choose one of the possible values. The value
`kcdf="Gaussian"` is suitable when input expression values are continuous, such as microarray
fluorescent units in logarithmic scale, RNA-seq log-CPMs, log-RPKMs, or log-TPMs. When input
expression values are integer counts, such as those derived from RNA-seq experiments, then this
argument should be set to `kcdf="Poisson"`. When we do not want to use a kernel approach for the
estimation of the ECDF, then we should set `kcdf="none"`.

`kcdfNoneMinSampleSize`
Integer vector of length 1. When `kcdf="auto"`, this parameter decides at what minimum sample size
`kcdf="none"`, i.e., the estimation of the empirical cumulative distribution function (ECDF) of
expression levels across samples is performed directly without using a kernel; see the `kcdf` slot.

`tau`
Numeric vector of length 1. The exponent defining the weight of the tail in the random walk
performed by the GSVA (Hänzelmann et al., 2013) method.

`maxDiff`
Logical vector of length 1 which offers two approaches to calculate the enrichment statistic (ES)
from the KS random walk statistic.

- `FALSE`: ES is calculated as the maximum distance from 0 of the random walk.

- `TRUE`: ES is calculated as the magnitude difference between the largest positive and negative
 random walk deviations.

`absRanking`
Logical vector of length 1 used only when `maxDiff=TRUE`. When `absRanking=FALSE` a modified Kuiper
statistic is used to calculate enrichment scores, taking the magnitude difference between the
largest positive and negative random walk deviations. When `absRanking=TRUE` the original Kuiper
statistic that sums the largest positive and negative random walk deviations, is used. In this
latter case, gene sets with genes enriched on either extreme (high or low) will be regarded as
’highly’ activated.

`sparse`
Logical vector of length 1 used only when the input expression data in `exprData` is stored in a
sparse matrix (e.g., a `dgCMatrix` or a container object, such as a `SingleCellExperiment`, storing
the expression data in a `dgCMatrix`). In such a case, when `sparse=TRUE`, a sparse version of the
GSVA algorithm will be applied. Otherwise, when `sparse=FALSE`, the classical version of the GSVA
algorithm will be used.

`checkNA`
Character vector of length 1. One of the strings `"auto"` (default), `"yes"`, or `"no"`, which refer
to whether the input expression data should be checked for the presence of missing (`NA`) values.

`didCheckNA`
Logical vector of length 1, indicating whether the input expression data was checked for the
presence of missing (`NA`) values.

`anyNA`
Logical vector of length 1, indicating whether the input expression data contains missing (`NA`)
values.

`use`
Character vector of length 1. One of the strings `"everything"` (default), `"all.obs"`, or
`"na.rm"`, which refer to three different policies to apply in the presence of missing values in the
input expression data; see `ssgseaParam`.

`filterRows`
Logical vector of length 1, indicating whether the rows in, the input expression data, typically
corresponding to transcripts, genes or proteins, should be filtered for constant expression across
columns, typically corresponding to samples or cells, with respect to all available (nonmissing)
values and to the non-zero values. By default, this slot is set to `TRUE` and the user may set it to
`FALSE` when there is absolute certainty that no such rows exist in the input expression data, since
this may save running time, especially with data sets with hundreds of thousands or millions of
columns.

### See Also

`GsvaExprData`, `GsvaGeneSets`, `GsvaMethodParam`, `plageParam`, `zscoreParam`, `ssgseaParam`

`GeneIdentifierType`, `matrix`, `ExpressionSet`, `SummarizedExperiment`, `SingleCellExperiment`,
`SpatialExperiment`

### Examples

```r
suppressPackageStartupMessages({
library(GSEABase)
library(GSVA)
library(GSVAdata)
})

data(geneprotExpCostaEtAl2021)
data(c2BroadSets)

## for simplicity, use only a subset of the sample data
se <- geneExpCostaEtAl2021[1:1000, ]
gsc <- c2BroadSets[1:100]
gp1 <- gsvaParam(se, gsc)
gp1

```

**Aliases:** `gsvaRowNorm`, `gsvaColRanks`, `gsvaColScores`

**Canonical source:** `repo/man/gsvaRanks.Rd`

## `gsvaRowNorm`: GSVA ranks and scores

### Description

Calculate GSVA scores in three steps: (1) normalize values of expression by row; (2) calculate GSVA
ranks by column from the previous row-normalized values; and (3) calculate GSVA scores by column
from the previously calculated column ranks.

### Usage

```r
gsvaRowNorm(
  param,
  verbose = TRUE,
  dropExistingAssays = FALSE,
  errorOnTooFewRows = TRUE,
  first = NA_real_,
  last = NA_real_,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

gsvaColRanks(
  rowNormExprData,
  verbose = TRUE,
  dropExistingAssays = FALSE,
  first = NA_real_,
  last = NA_real_,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)

gsvaColScores(
  rankExprData,
  geneSets,
  verbose = TRUE,
  first = NA_real_,
  last = NA_real_,
  recompute_nzcount = FALSE,
  BPPARAM = SerialParam(progressbar = verbose),
  maxmem = "auto"
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `param` | A `gsvaParam` object built using the constructor function `gsvaParam`. |
| `verbose` | Gives information about each calculation step. Default: `TRUE`. |
| `dropExistingAssays` | Logical vector of length 1. It only applies when the input expression data is stored using a `SummarizedExperiment` derivative, which allows one to store more than one matrix of expression values in different assay slots. By default `dropExistingAssays=FALSE` and the new assay with the row-normalized expression values or the column ranks will be stored as a new assay in the same input object. When `dropExistingAssays=TRUE`, any existing assay will be dropped before adding the new assay with the row-normalized expression values or the column ranks. |
| `errorOnTooFewRows` | Logical vector of length 1. When `TRUE` (default), an error will be thrown if the number of rows in the input expression data is less then 2 after filtering out rows with constant values across columns. When `FALSE`, a warning will be given instead, and the returned object will either have one or no rows. |
| `first` | Numeric vector of length 1. First row, in the case of `gsvaRowNorm()`, or first column, in the case of `gsvaColRanks()` and `gsvaColScores()`, to which calculations should be restricted. By default, `first=NA_real_`, which implies that calculations start at the first row or column of the input expression data. |
| `last` | Numeric vector of length 1. Last row, in the case of `gsvaRowNorm()`, or last column, in the case of `gsvaColRanks()` and `gsvaColScores()`, to which calculations should be restricted. By default, `last=NA_real_`, which implies that calculations end at the last row or column of the input expression data. |
| `BPPARAM` | An object of class `BiocParallelParam` specifying parameters related to the parallel execution of some of the tasks and calculations within this function. |
| `maxmem` | A vector of length 1 either specifying a number in bytes, or a character string with either the word `auto` (default), or a number followed by a suffix indicating kilobytes (K), megabytes (M), gigabytes (G) or terabytes (T), which GSVA will use to attempt bounding the maximum amount of main memory used across all threads of execution to that given quantity. By default `maxmem="auto"`, indicating that the maximum memory will be the 90% of the total main memory, as calculated by `Sys.meminfo()`. To avoid setting any bound on the maximum memory, use `maxmem=Inf`. Note that the amount of main memory used in an R session or script may depend on other commands and packages used in that same session or script. |
| `rowNormExprData` | A row-normalized expression data set obtained with `gsvaRowNorm`. It can be either a single character string with path to a directory containing the column-rank data stored with `saveHDF5GSVA`, or an object of one of the classes supported by `GsvaExprData`. For a list of these classes, see `class? GsvaExprData`. |
| `rankExprData` | A column-rank expression data set obtained with `gsvaColRanks`. It can be either a single character string with path to a directory containing the column-rank data stored with `saveHDF5GSVA`, or an object of one of the classes supported by `GsvaExprData`. For a list of these classes, see `class? GsvaExprData`. |
| `geneSets` | An object of the classes supported by `GsvaGeneSets`. Currently, either a `GeneSetCollection` object or a `list` object. |
| `recompute_nzcount` | Logical vector of length 1. When `TRUE`, the number of non-zero rows in the input expression data will be recomputed, internally used only. |

### Value

In the case of 'gsvaRowNorm()', an object of the same class as the input expresssion data given in
the argument `exprData` of the `gsvaParam` object, containing the row-normalized expression values.
The resulting object will have metadata with a copy of the input `gsvaParam` object, except for the
`exprData` slot, and in the case of being a derivative of a `SummarizedExperiment` object, an
additional assay called "gsvarnorm" storing the row-normalized expression values.

In the case of 'gsvaColRanks()', an object of the same class as the input expresssion data given in
the argument `exprData` of the `gsvaParam` object, containing the column rank values. The resulting
object will have metadata with a copy of the input `gsvaParam` object, except for the `exprData`
slot, and in the case of being a derivative of a `SummarizedExperiment` object, an additional assay
called "gsvaranks" storing the column rank values.

In the case of 'gsvaColScores()', an object of the same class as the input expression data given in
the argument `exprData` of the `gsvaParam` object, containing the enrichment scores for the given
gene sets. Note that while it will have the same columns as the input expression data, the rows will
correspond to the gene sets for which the enrichment scores were calculated.

### See Also

`gsvaParam`, `gsva`, `gsvaEnrichment`, `BiocParallelParam`,

### Examples

```r
library(GSVA)

p <- 10 ## number of genes
n <- 30 ## number of samples

## consider three disjoint gene sets
geneSets <- list(gset1=paste0("g", 1:3),
                 gset2=paste0("g", 4:6),
                 gset3=paste0("g", 7:10))

## sample data from a normal distribution with mean 0 and st.dev. 1
y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

## build GSVA parameter object
gsvapar <- gsvaParam(y, geneSets)

## calculate row-normalized expression values
gsvarownormexpr <- gsvaRowNorm(gsvapar)

## calculate GSVA column ranks
gsvacolranks <- gsvaColRanks(gsvarownormexpr)

## calculate GSVA scores
gsva_es <- gsvaColScores(gsvacolranks)

## calculate now GSVA scores in a single step
gsva_es1 <- gsva(gsvapar)

## both approaches give the same result with the same input gene sets
all.equal(gsva_es1, gsva_es)

## however, results will be (obviously) different with different gene sets
geneSets2 <- list(gset1=paste0("g", 3:6),
                  gset2=paste0("g", c(1, 2, 7, 8)))

## note that there is no need to calculate the GSVA ranks again
## geneSets(gsvarankspar) <- geneSets2
## gsvaScores(gsvarankspar)
```

**Aliases:** `guessGeneIdType`

**Canonical source:** `repo/man/guessGeneIdType.Rd`

## `guessGeneIdType`: Guess the gene identifier type from a list of character vectors

### Description

This function tries to derive the type of gene IDs used in a named list of `character` vectors
provided as input.

### Usage

```r
guessGeneIdType(geneIdsList)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneIdsList` | A named list of character vectors like the ones returned by `geneIds()`. |

### Details

In order to make this function useful and keep it as simple as possible, we limit ourselves to the
most common types of gene identifiers: "Gene IDs" consisting of digits only are considered ENTREZ
IDs, anything starting with 'ENS' an ENSEMBL identifier and anything else a HuGO gene symbol.

### Value

An object of a subclass of `GeneIdentifierType` derived from the input.

### See Also

`GeneIdentifierType`

### Examples

```r
library(GSVA)

gsets <- list(INNATE_RESPONSE=c("AIM2", "ALPK1", "AP3B1"),
              ADAPTIVE_RESPONSE=c("CD27", "CD70", "EBAG9"))

idtype <- guessGeneIdType(gsets)
idtype
class(idtype)
```

**Aliases:** `igsva`

**Canonical source:** `repo/man/igsva.Rd`

## `igsva`: Gene Set Variation Analysis

### Description

Starts an interactive GSVA shiny web app.

GSVA assesses the relative enrichment of gene sets across samples using a non-parametric approach.
Conceptually, GSVA transforms a p-gene by n-sample gene expression matrix into a g-geneset by
n-sample pathway enrichment matrix. This facilitates many forms of statistical analysis in the
'space' of pathways rather than genes, providing a higher level of interpretability.

The `igsva()` function starts an interactive shiny web app that allows the user to configure the
arguments of the `gsva()` function and runs it on the computer. Please see the manual page of the
`gsva()` function for a description of the arguments and their default and alternative values.

The input data may be loaded from the users workspace or by selecting a CSV file for the expression
data, and a GMT file for the gene sets data.

### Usage

```r
igsva()
```

### Value

A gene-set by sample matrix of GSVA enrichment scores after pressing the button 'Save & Close'. This
result can be also downloaded as a CSV file with the 'Download' button.

### See Also

`gsva()`

### Examples

```r
res <- igsva() ## this will open your browser with the GSVA shiny web app

```

**Aliases:** `gsvaMap`, `gsvaReduce`, `gsvaBatchtoolsSlurmParam`

**Canonical source:** `repo/man/map-reduce.Rd`

## `gsvaMap`: MapReduce parallelization for HPC environments

### Description

The functions `gsvaMap()` and `gsvaReduce()` allow one to run GSVA calculations across multiple
compute nodes in a high-performance computing (HPC) environment. The `gsvaMap()` function is used to
launch the GSVA calculations on each compute node, while the `gsvaReduce()` function is used to
combine the results from all nodes into a single object.

The specific HPC backend used for parallelization is determined by the `BTPARAM` argument to the
`gsvaMap()` function, which should be an object of class `BatchtoolsParam`. The function
`gsvaBatchtoolsSlurmParam()` is provided to create a `BatchtoolsParam` object with some sensible
defaults for running GSVA calculations on a Slurm cluster. The calculations across independent
compute nodes without shared memory are enabled by using on-disk data structures that store
enrichment scores and intermediate results in HDF5 files located in a filesystem path specified in
the `dir` argument of `gsvaBatchtoolsSlurmParam()`, which defaults to a directory named "GSVAOUTPUT"
in the current working directory from where the R session calling `gsvaMap()` was launched. The user
must ensure that this path is reachable by all compute nodes in the HPC environment, and must
manually delete its contents after the GSVA calculations are finished.

### Usage

```r
gsvaMap(
  FUN,
  inputData,
  returnPath = FALSE,
  verbose = TRUE,
  BTPARAM = BatchtoolsParam(workers = 2, progressbar = verbose)
)

gsvaReduce(mapOutput, verbose = TRUE)

gsvaBatchtoolsSlurmParam(
  dir = "GSVAOUTPUT",
  partition,
  walltime = 600,
  nodes = 2,
  ncpus_per_task = 2,
  mem = "10G"
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `FUN` | In `gsvaMap()`, function to map to the data in the `inputData` argument. |
| `inputData` | In `gsvaMap()`, input data for performing the calculations in parallel. It should be an object either of class `gsvaParam`, or one of the classes supported by `GsvaExprData` as output from `gsvaRowNorm` or `gsvaColRanks`; for a list of these classes consult `class? GsvaExprData`. It can also be a list object with the output of `gsvaMap()` itself, to proceed through the three-step pipeline of calculating row-normalized expression values, column ranks, and GSVA scores without having to call to `gsvaReduce()` in between. |
| `returnPath` | In `gsvaMap()`, if `TRUE`, the output of the function will be a list of file paths where the resulting objects have been serialized using `saveHDF5GSVA`, instead returning the list of resulting objects themselves, which is the default behavior (`FALSE`). |
| `verbose` | Gives information about the progress of the calculations. Default: `TRUE`. |
| `BTPARAM` | In `gsvaMap()`, an object of class `BatchtoolsParam` specifying parameters for parallel execution in an HPC environment. By default, it is set to a `BatchtoolsParam` object with 2 workers and a progress bar enabled, and this will start a multicore execution using CPU cores in the compute node where `gsvaMap()` has been called, i.e., by default it will not deploy an HPC environment. For that purpose, users should either create a `BatchtoolsParam` object themselves with appropriate arguments or, if an SLURM HPC environment is available, they may use the wrapper function `gsvaBatchtoolsSlurmParam()`, which is provided to create a `BatchtoolsParam` object with some sensible defaults for running GSVA calculations on a SLURM cluster. |
| `mapOutput` | In `gsvaReduce()`, the output of `gsvaMap()`. |
| `dir` | In `gsvaBatchtoolsSlurmParam()`, path to a directory where the output of the GSVA calculations will be saved. Default: "GSVAOUTPUT" in the current working directory. |
| `partition` | In `gsvaBatchtoolsSlurmParam()`, name of the Slurm partition to use for the GSVA calculations. No default value, the user must provide a valid partition name for the Slurm cluster. |
| `walltime` | In `gsvaBatchtoolsSlurmParam()`, maximum wall time in seconds for the GSVA calculations. Default: 600 seconds (10 minutes). |
| `nodes` | In `gsvaBatchtoolsSlurmParam()`, number of independent compute nodes to distribute the GSVA calculations (tasks) across. Default: 1. |
| `ncpus_per_task` | In `gsvaBatchtoolsSlurmParam()`, number of CPU cores to use for each independent task executed within a compute node. Default: 1. |
| `mem` | In `gsvaBatchtoolsSlurmParam()`, amount of memory to allocate for each independent task executed within a compute node. Default: "10G". |

### Value

The `gsvaMap()` function returns either a list of objects with the results of the GSVA calculations
for each compute node, or a list of file paths where the results are saved. The `gsvaReduce()`
function returns a single object that combines the results from all compute nodes. The
`gsvaBatchtoolsSlurmParam()` function returns a `BatchtoolsParam` object with some sensible defaults
for running GSVA calculations on a SLURM cluster.

### Examples

```r
p <- 10 ## number of genes
n <- 30 ## number of samples
nGrp1 <- 15 ## number of samples in group 1
nGrp2 <- n - nGrp1 ## number of samples in group 2

## consider three disjoint gene sets
geneSets <- list(gset1=paste0("g", 1:3),
                 gset2=paste0("g", 4:6),
                 gset3=paste0("g", 7:10))

## sample data from a normal distribution with mean 0 and st.dev. 1
y <- matrix(rnorm(n*p), nrow=p, ncol=n,
            dimnames=list(paste("g", 1:p, sep="") , paste("s", 1:n, sep="")))

## build GSVA parameter object
gsvapar <- gsvaParam(y, geneSets)

## calculate row-normalized expression values in parallel across multiple
## compute nodes in a high-performance computing (HPC) environment
gsvarnorm <- gsvaReduce(gsvaMap(gsvaRowNorm, gsvapar))

## calculate column GSVA ranks in parallel across multiple
## compute nodes in a high-performance computing (HPC) environment
gsvaranks <- gsvaReduce(gsvaMap(gsvaColRanks, gsvarnorm))

## calculate column GSVA scores in parallel across multiple
## compute nodes in a high-performance computing (HPC) environment
gsvaes <- gsvaReduce(gsvaMap(gsvaColScores, gsvaranks))

## the example below assumes that a SLURM HPC environment is available
## with a partition named 'short' and that the user has write access to a
## filesystem path called 'GSVAOUTPUT' in the current working directory
## where this script is run and where the GSVA calculations will be saved.
## The user must ensure that this path is reachable by all compute nodes in
## the HPC environment, and must manually delete its contents after the GSVA
## calculations are finished.
## Not run:
gsvabtpar <- gsvaBatchtoolsSlurmParam(partition="short")
gsvaes <- gsvaReduce(gsvaMap(gsvaColScores, gsvaranks, BTPARAM=gsvabtpar))

## End(Not run)
```

**Aliases:** `plageParam-class`, `plageParam`

**Canonical source:** `repo/man/plageParam-class.Rd`

## `plageParam-class`: `plageParam` class

### Description

S4 class for PLAGE method parameter objects.

Objects of class `plageParam` contain the parameters for running the `PLAGE` method.

### Usage

```r
plageParam(
  exprData,
  geneSets,
  assay = NA_character_,
  annotation = NULL,
  minSize = 1,
  maxSize = Inf,
  ondisk = c("auto", "yes", "no"),
  verbose = TRUE
)
```

### Arguments

- `exprData`: The expression data set. Must be one of the classes supported by `GsvaExprData`.
 For a list of these classes, see its help page using `help(GsvaExprData)`.
- `geneSets`: The gene sets. Must be one of the classes supported by `GsvaGeneSets`. For a list
 of these classes, see its help page using `help(GsvaGeneSets)`.
- `assay`: Character vector of length 1. The name of the assay to use in case `exprData` is a
 multi-assay container, otherwise ignored. By default, an assay called 'logcounts' will be used if
 present, otherwise the first assay is used.
- `annotation`: An object of class `GeneIdentifierType` from package `GSEABase`
 describing the gene identifiers used as the row names of the expression data set. See
 `GeneIdentifierType` for help on available gene identifier types and how to construct
 them. This information can be used to map gene identifiers occurring in the gene sets.
 If the default value `NULL` is provided, an attempt will be made to extract the gene
 identifier type from the expression data set provided as `exprData` (by calling
 `gsvaAnnotation` on it). If still not successful, the `NullIdentifier()` will
 be used as the gene identifier type, gene identifier mapping will be disabled and gene identifiers
 used in expression data set and gene sets can only be matched directly.
- `minSize`: Numeric vector of length 1. Minimum size of the resulting gene sets after gene
 identifier
 mapping. By default, the minimum size is 1.
- `maxSize`: Numeric vector of length 1. Maximum size of the resulting gene sets after gene
 identifier
 mapping. By default, the maximum size is `Inf`.
- `ondisk`: Character vector of length 1 denoting whether an on-disk backend should be used to
 reduce the
 memory footprint. The default value `ondisk="auto"` will attempt to load all the data in
 main memory when the input nonzero values fit in main memory, otherwise it will attempt working
with
 an on-disk data structure that reduces de memory footprint. When `ondisk="yes"` it will
 attempt to work with an on-disk data structure, while when `ondisk="no"` it will attempt
 to load all the data in main memory.
- `verbose`: Logical vector of length 1. It gives information about some decisions made by the
 software
 during parameter object construction when `verbose=TRUE` (default) and remains silent
 otherwise.

### Details

Since method PLAGE does not take any method-specific parameters, this class does not add any slots
to the common slots inherited from `GsvaMethodParam`.

`PLAGE` takes a number of parameters shared with all methods implemented by package GSVA but does
not take any method-specific parameters. These parameters are described in detail below.

### Value

A new `plageParam` object.

### See Also

`GsvaExprData`, `GsvaGeneSets`, `GsvaMethodParam`, `zscoreParam`, `ssgseaParam`, `gsvaParam`

`GeneIdentifierType`

### Examples

```r
suppressPackageStartupMessages({
library(GSEABase)
library(GSVA)
library(GSVAdata)
})

data(geneprotExpCostaEtAl2021)
data(c2BroadSets)

## for simplicity, use only a subset of the sample data
se <- geneExpCostaEtAl2021[1:1000, ]
gsc <- c2BroadSets[1:100]
pp1 <- plageParam(se, gsc)
pp1
```

**Aliases:** `readGMT`

**Canonical source:** `repo/man/readGMT.Rd`

## `readGMT`: Import Gene Sets from a GMT File

### Description

Imports a list of gene sets from a GMT (Gene Matrix Transposed) format file, offering a choice of
ways to handle duplicated gene set names.

### Usage

```r
readGMT(
  con,
  sep = "\t",
  geneIdType = "auto",
  collectionType = NullCollection(),
  valueType = c("GeneSetCollection", "list"),
  deduplUse = c("first", "drop", "union", "smallest", "largest"),
  ...
)
```

### Arguments

- `con`: A connection object or a non-empty character string of length 1 containing e.g. the
 filename
 or URL of a (possibly compressed) GMT file.
- `sep`: The character string separating members of each gene set in the GMT file.
- `geneIdType`: By default a character vector of length 1 with the special value `"auto"` or an
 object of a subclass of `GeneIdentifierType`. If set to `"auto"`, the function
 will try to derive the gene ID type from argument `geneIdsList` using
 `guessGeneIdType`. Other values, including `NULL`, will be ignored with a
 warning and `geneIdType=NullIdentifier()` will be used instead. Depending on the value of
 argument `valueType`, the gene ID type of the resulting list or of all
 `GeneSet` objects in the resulting `GeneSetCollection` will be set to this
 value.
- `collectionType`: Only used when `valueType == "GeneSetCollection"`. See `getGmt` for
 more information.
- `valueType`: A character vector of length 1 specifying the desired type of return value. It must
 be one
 of:
 - `GeneSetCollection` (the default): a `GeneSetCollection` object as
 defined and described by package `GSEABase`.
 - `list`: a named list of gene sets represented as character vectors of gene IDs.
 This format is much simpler and cannot store the metadata required for automatic mapping of gene
 IDs.
- `deduplUse`: A character vector of length 1 specifying one of several methods to handle duplicated
 gene
 set names. Duplicated gene set names are explicitly forbidden by the [GMT file
 format
specification](https://software.broadinstitute.org/cancer/software/gsea/wiki/index.php/Data_formats)
but can nevertheless be encountered in the wild. The available choices
 are:
 - `first` (the default): drops all gene sets whose names are duplicated according to
 the base R function and retains only the first occurence of a gene set name.
 - `drop`: removes all gene sets that have a duplicated name, including its
 first occurrence.
 - `union`: replaces gene sets with duplicated names by a single gene set containing
 the union of all their gene IDs.
 - `smallest`: drops gene sets with duplicated names and retains only the smallest of
 them, i.e. the one with the fewest gene IDs. If there are several smallest gene sets, the first
will
 be selected.
 - `largest`: drops gene sets with duplicated names and retains only the largest of
 them, i.e. the one with the most gene IDs. If there are several largest gene sets, the first will
be
 selected.
- `...`: Further arguments passed on to `readLines()`

### Value

The gene sets imported from the GMT file, with duplicate gene sets resolved according to argument
`deduplUse` and in the format determined by argument `valueType`.

### See Also

`deduplicateGeneSets`, `readLines`, `GeneSetCollection`, `GeneIdentifierType`, `getGmt`,

### Examples

```r
library(GSVA)
suppressPackageStartupMessages(library(GSVAdata))

fname <- file.path(system.file("extdata", package="GSVAdata"),
   "c2.subsetdups.v7.5.symbols.gmt.gz")

## by default, guess geneIdType from content and return a GeneSetCollection
genesets <- readGMT(fname)
genesets

## how to manually override the geneIdType
genesets <- readGMT(fname, geneIdType=NullIdentifier())
genesets

## how to drop *all* gene sets with duplicated names (instead of ignoring
## only the duplicated one)
genesets <- readGMT(fname, deduplUse="drop")
genesets

## return a simple list instead of a GeneSetCollection
genesets <- readGMT(fname, valueType="list")
head(genesets, 2)

## the list has a geneIdType, too
gsvaAnnotation(genesets)
```

**Aliases:** `spatCor`, `spatCor,SpatialExperiment-method`

**Canonical source:** `repo/man/spatCor.Rd`

## `spatCor`: Compute Spatial Autocorrelation for SpatialExperiment objects

### Description

Computes spatial autocorrelation using Moran's I statistic for a `SpatialExperiment` object, using
an inverse squared distance weight matrix as default, or an inverse distance weight matrix as an
alternative. It also tests for spatial autocorrelation assuming normality.

### Usage

```r
## S4 method for signature 'SpatialExperiment'
spatCor(
  spe,
  assay = NA_character_,
  na.rm = FALSE,
  alternative = "two.sided",
  squared = TRUE,
  verbose = TRUE,
  BPPARAM = SerialParam(progressbar = verbose)
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `spe` | An object of `SpatialExperiment` class. |
| `assay` | Character vector of length 1, specifying the name of the assay to use. By default, an assay called 'logcounts' will be used if present, otherwise the first assay is used. |
| `na.rm` | A logical indicating whether missing values should be removed. |
| `alternative` | A character string specifying the alternative hypothesis tested against the null hypothesis of no spatial autocorrelation; must be one of "two.sided", "less", or "greater", or any unambiguous abbreviation of these. |
| `squared` | A logical indicating whether the inverse distance weight matrix should be squared or not. |
| `verbose` | Gives information about each calculation step. Default: `TRUE`. |
| `BPPARAM` | An object of class `BiocParallelParam` specifying parameters related to the parallel execution of some of the tasks and calculations within this function. |

### Value

A `data.frame` with the same row names as the original `SpatialExperiment` object. Columns include
the observed Moran's I statistic, the expected Moran's I statistic under no spatial autocorrelation,
the expected standard deviation under no spatial autocorrelation, and the p-value of the test.

### See Also

`BiocParallelParam`

### Examples

```r
suppressPackageStartupMessages({
    library(Matrix)
    library(GSVAdata)
})

spe <- HumanCerebellumNormSubset()

set.seed(123) ## for reproducibility of the random gene sets
## build two gene sets with 4 randomly chosen genes and one
## third gene set with a few microglia marker genes
gsets <- list(gset1=sample(rownames(spe), size=4, replace=FALSE),
              gset2=sample(rownames(spe), size=4, replace=FALSE),
              microglia=c("ENSG00000078808", "ENSG00000116251",
                          "ENSG00000142583", "ENSG00000173372"))

## calculate GSVA enrichment scores
gsvapar <- gsvaParam(spe, gsets, verbose=FALSE)
es <- gsva(gsvapar, verbose=FALSE)

## calculate spatial autocorrelation on the GSVA enrichment scores
spatCor(es, verbose=FALSE)
```

**Aliases:** `ssgseaParam-class`, `ssgseaParam`, `anyNA,ssgseaParam-method`

**Canonical source:** `repo/man/ssgseaParam-class.Rd`

## `ssgseaParam-class`: `ssgseaParam` class

### Description

S4 class for ssGSEA method parameter objects.

Objects of class `ssgseaParam` contain the parameters for running the `ssGSEA` method.

### Usage

```r
ssgseaParam(
  exprData,
  geneSets,
  assay = NA_character_,
  annotation = NULL,
  minSize = 1,
  maxSize = Inf,
  alpha = 0.25,
  normalize = TRUE,
  checkNA = c("auto", "yes", "no"),
  use = c("everything", "all.obs", "na.rm"),
  ondisk = c("auto", "yes", "no"),
  verbose = TRUE
)

## S4 method for signature 'ssgseaParam'
anyNA(x, recursive = FALSE)
```

### Arguments

- `exprData`: The expression data set. Must be one of the classes supported by `GsvaExprData`.
 For a list of these classes, see its help page using `help(GsvaExprData)`.
- `geneSets`: The gene sets. Must be one of the classes supported by `GsvaGeneSets`. For a list
 of these classes, see its help page using `help(GsvaGeneSets)`.
- `assay`: Character vector of length 1. The name of the assay to use in case `exprData` is a
 multi-assay container, otherwise ignored. By default, an assay called 'logcounts' will be used if
 present, otherwise the first assay is used.
- `annotation`: An object of class `GeneIdentifierType` from package `GSEABase`
 describing the gene identifiers used as the row names of the expression data set. See
 `GeneIdentifierType` for help on available gene identifier types and how to construct
 them. This information can be used to map gene identifiers occurring in the gene sets.
 If the default value `NULL` is provided, an attempt will be made to extract the gene
 identifier type from the expression data set provided as `exprData` (by calling
 `gsvaAnnotation` on it). If still not successful, the `NullIdentifier()` will
 be used as the gene identifier type, gene identifier mapping will be disabled and gene identifiers
 used in expression data set and gene sets can only be matched directly.
- `minSize`: Numeric vector of length 1. Minimum size of the resulting gene sets after gene
 identifier
 mapping. By default, the minimum size is 1.
- `maxSize`: Numeric vector of length 1. Maximum size of the resulting gene sets after gene
 identifier
 mapping. By default, the maximum size is `Inf`.
- `alpha`: Numeric vector of length 1. The exponent defining the weight of the tail in the random
 walk
 performed by the `ssGSEA` method. The default value is 0.25 as
 described in the paper.
- `normalize`: Logical vector of length 1; if `TRUE` runs the `ssGSEA` method from
 Barbie et al. (2009) normalizing the scores by the absolute difference between the minimum and the
 maximum, as described in their paper. Otherwise this final normalization step is skipped.
- `checkNA`: Character vector of length 1 specifying whether the input expression data should be
 checked
 for the presence of missing values (`NA` or `NaN`). This must be one of the
 strings `"auto"` (default), `"yes"`, or `"no"`. The default value
 `"auto"` means that the software will perform that check only when the input expression
 data is provided as a base `matrix`, an `ExpressionSet` or a
 `SummarizedExperiment` object, while every other type of input expression data container
 (e.g., `SingleCellExperiment`, etc.) will not be checked. If `checkNA="yes"`,
 then the input expression data will be checked for missing values irrespective of the object class
 of the data container, and if `checkNA="no"`, then that check will not be
 performed.
- `use`: Character vector of length 1 specifying a policy for dealing with missing values
 (`NA` or `NaN`) in the input expression data argument `exprData`.
 It only applies when either `checkNA="yes"`, or `checkNA="auto"` (see the
 `checkNA` parameter. The argument value must be one of the strings
 `"everything"` (default), `"all.obs"`, or `"na.rm"`. The policy of
 the default value `"everything"` consists of propagating missing values so that the
 resulting enrichment score will be `NA`, whenever one or more of its contributing values
 is missing, giving a warning when that happens. When `use="all.obs"`, the presence of
 `NA`s in the input expression data will produce an error. Finally, when
 `use="na.rm"`, missing values in the input expression data will be removed from
 calculations, giving a warning when that happens, and giving an error if no values are left after
 removing the missing values.
- `ondisk`: Character vector of length 1 denoting whether an on-disk backend should be used to
 reduce the
 memory footprint. The default value `ondisk="auto"` will attempt to load all the data in
 main memory when the input nonzero values fit in main memory, otherwise it will attempt working
with
 an on-disk data structure that reduces de memory footprint. When `ondisk="yes"` it will
 attempt to work with an on-disk data structure, while when `ondisk="no"` it will attempt
 to load all the data in main memory.
- `verbose`: Logical vector of length 1. It gives information about some decisions made by the
 software
 during parameter object construction when `verbose=TRUE` (default) and remains silent
 otherwise.
- `x`: An object of class `ssgseaParam`.
- `recursive`: Not used with `x` being an object of class `ssgseaParam`.

### Details

In addition to the common parameter slots inherited from `[GsvaMethodParam]`, this class has slots
for the two method-specific parameters of the `ssGSEA` method described below as well as four more
slots for implementing a missing value policy.

In addition to a number of parameters shared with all methods implemented by package GSVA, `ssGSEA`
takes two method-specific parameters as well as two more parameters for implementing a missing value
policy. All of these parameters are described in detail below.

### Value

A new `ssgseaParam` object.

### Slots

`alpha`
Numeric vector of length 1. The exponent defining the weight of the tail in the random walk
performed by the ssGSEA method.

`normalize`
Logical vector of length 1. If `TRUE` runs the ssGSEA method from Barbie et al. (2009) normalizing
the scores by the absolute difference between the minimum and the maximum, as described in their
paper. Otherwise this final normalization step is skipped.

`checkNA`
Character vector of length 1. One of the strings `"auto"` (default), `"yes"`, or `"no"`, which refer
to whether the input expression data should be checked for the presence of missing (`NA`) values.

`didCheckNA`
Logical vector of length 1, indicating whether the input expression data was checked for the
presence of missing (`NA`) values.

`anyNA`
Logical vector of length 1, indicating whether the input expression data contains missing (`NA`)
values.

`use`
Character vector of length 1. One of the strings `"everything"` (default), `"all.obs"`, or
`"na.rm"`, which refer to three different policies to apply in the presence of missing values in the
input expression data; see `ssgseaParam`.

### See Also

`GsvaExprData`, `GsvaGeneSets`, `GsvaMethodParam`, `plageParam`, `zscoreParam`, `gsvaParam`

`GeneIdentifierType`, `matrix`, `ExpressionSet`, `SummarizedExperiment`, `SingleCellExperiment`

### Examples

```r
suppressPackageStartupMessages({
library(GSEABase)
library(GSVA)
library(GSVAdata)
})

data(geneprotExpCostaEtAl2021)
data(c2BroadSets)

## for simplicity, use only a subset of the sample data
se <- geneExpCostaEtAl2021[1:1000, ]
gsc <- c2BroadSets[1:100]
sp1 <- ssgseaParam(se, gsc)
sp1
```

**Aliases:** `zscoreParam-class`, `zscoreParam`

**Canonical source:** `repo/man/zscoreParam-class.Rd`

## `zscoreParam-class`: `zscoreParam` class

### Description

S4 class for combined z-scores method parameter objects.

Objects of class `zscoreParam` contain the parameters for running the combined z-scores method.

### Usage

```r
zscoreParam(
  exprData,
  geneSets,
  assay = NA_character_,
  annotation = NULL,
  minSize = 1,
  maxSize = Inf,
  ondisk = c("auto", "yes", "no"),
  verbose = TRUE
)
```

### Arguments

- `exprData`: The expression data set. Must be one of the classes supported by `GsvaExprData`.
 For a list of these classes, see its help page using `help(GsvaExprData)`.
- `geneSets`: The gene sets. Must be one of the classes supported by `GsvaGeneSets`. For a list
 of these classes, see its help page using `help(GsvaGeneSets)`.
- `assay`: Character vector of length 1. The name of the assay to use in case `exprData` is a
 multi-assay container, otherwise ignored. By default, an assay called 'logcounts' will be used if
 present, otherwise the first assay is used.
- `annotation`: An object of class `GeneIdentifierType` from package `GSEABase`
 describing the gene identifiers used as the row names of the expression data set. See
 `GeneIdentifierType` for help on available gene identifier types and how to construct
 them. This information can be used to map gene identifiers occurring in the gene sets.
 If the default value `NULL` is provided, an attempt will be made to extract the gene
 identifier type from the expression data set provided as `exprData` (by calling
 `gsvaAnnotation` on it). If still not successful, the `NullIdentifier()` will
 be used as the gene identifier type, gene identifier mapping will be disabled and gene identifiers
 used in expression data set and gene sets can only be matched directly.
- `minSize`: Numeric vector of length 1. Minimum size of the resulting gene sets after gene
 identifier
 mapping. By default, the minimum size is 1.
- `maxSize`: Numeric vector of length 1. Maximum size of the resulting gene sets after gene
 identifier
 mapping. By default, the maximum size is `Inf`.
- `ondisk`: Character vector of length 1 denoting whether an on-disk backend should be used to
 reduce the
 memory footprint. The default value `ondisk="auto"` will attempt to load all the data in
 main memory when the input nonzero values fit in main memory, otherwise it will attempt working
with
 an on-disk data structure that reduces de memory footprint. When `ondisk="yes"` it will
 attempt to work with an on-disk data structure, while when `ondisk="no"` it will attempt
 to load all the data in main memory.
- `verbose`: Logical vector of length 1. It gives information about some decisions made by the
 software
 during parameter object construction when `verbose=TRUE` (default) and remains silent
 otherwise.

### Details

Since the combined z-scores method does not take any method-specific parameters, this class does not
add any slots to the common slots inherited from `GsvaMethodParam`.

The combined z-scores method takes a number of parameters shared with all methods implemented by
package GSVA but does not take any method-specific parameters.

### Value

A new `zscoreParam` object.

### See Also

`GsvaExprData`, `GsvaGeneSets`, `GsvaMethodParam`, `plageParam`, `ssgseaParam`, `gsvaParam`

`GeneIdentifierType`

### Examples

```r
suppressPackageStartupMessages({
library(GSEABase)
library(GSVA)
library(GSVAdata)
})

data(geneprotExpCostaEtAl2021)
data(c2BroadSets)

## for simplicity, use only a subset of the sample data
se <- geneExpCostaEtAl2021[1:1000, ]
gsc <- c2BroadSets[1:100]
zp1 <- zscoreParam(se, gsc)
zp1
```
