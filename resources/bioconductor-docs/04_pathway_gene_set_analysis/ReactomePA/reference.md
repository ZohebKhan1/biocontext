# ReactomePA API reference

Generated from the canonical package `man/*.Rd` sources. Package version `1.57.0`; 9 reference
topics.

**Aliases:** `DataSet`

**Canonical source:** `repo/man/DataSet.Rd`

## `DataSet`: Datasets sample contains a sample of gene IDs.

### Description

Datasets sample contains a sample of gene IDs.

**Aliases:** `enrichPathway`

**Canonical source:** `repo/man/enrichPathway.Rd`

## `enrichPathway`: Pathway Enrichment Analysis of a gene set. Given a vector of genes, this function will return the enriched pathways with FDR control.

### Description

Pathway Enrichment Analysis of a gene set. Given a vector of genes, this function will return the
enriched pathways with FDR control.

### Usage

```r
enrichPathway(
  gene,
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  universe = NULL,
  minGSSize = 10,
  maxGSSize = 500,
  qvalueCutoff = 0.2,
  organism = "human",
  readable = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id. |
| `pvalueCutoff` | Cutoff value of pvalue. |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `universe` | background genes |
| `minGSSize` | minimal size of genes annotated by Ontology term for testing. |
| `maxGSSize` | maximal size of each geneSet for analyzing |
| `qvalueCutoff` | Cutoff value of qvalue |
| `organism` | one of "human", "rat", "mouse", "celegans", "yeast", "zebrafish", "fly". |
| `readable` | whether mapping gene ID to gene Name |

### Value

A `enrichResult` instance.

### See Also

`enrichResult-class`

### Examples

```r
    gene <- c("11171", "8243", "112464", "2194",
            "9318", "79026", "1654", "65003",
            "6240", "3476", "6238", "3836",
            "4176", "1017", "249")
    yy = enrichPathway(gene, pvalueCutoff=0.05)
    head(summary(yy))
    #plot(yy)
```

**Aliases:** `getALLEG`

**Canonical source:** `repo/man/getALLEG.Rd`

## `getALLEG`: getALLEG

### Description

get all entrezgene ID of a specific organism

### Usage

```r
getALLEG(organism)
```

### Arguments

| Argument | Description |
| --- | --- |
| `organism` | species |

### Value

entrez gene ID vector

**Aliases:** `getDb`

**Canonical source:** `repo/man/getDb.Rd`

## `getDb`: getDb

### Description

mapping organism name to annotationDb package name

### Usage

```r
getDb(organism)
```

### Arguments

| Argument | Description |
| --- | --- |
| `organism` | one of supported organism |

### Value

annotationDb name

**Aliases:** `gsePathway`

**Canonical source:** `repo/man/gsePathway.Rd`

## `gsePathway`: gsePathway

### Description

Gene Set Enrichment Analysis of Reactome Pathway

### Usage

```r
gsePathway(
  geneList,
  organism = "human",
  exponent = 1,
  minGSSize = 10,
  maxGSSize = 500,
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  verbose = TRUE,
  nPerm = 1000,
  method = "multilevel",
  adaptive = FALSE,
  minPerm = 101,
  maxPerm = 1e+05,
  pvalThreshold = 0.1
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | order ranked geneList |
| `organism` | organism |
| `exponent` | weight of each step |
| `minGSSize` | minimal size of each geneSet for analyzing |
| `maxGSSize` | maximal size of each geneSet for analyzing |
| `pvalueCutoff` | pvalue Cutoff |
| `pAdjustMethod` | pvalue adjustment method |
| `verbose` | print message or not |
| `nPerm` | The number of permutations for the "permute" method |
| `method` | one of "sample", "permute", "multilevel" |
| `adaptive` | logical |
| `minPerm` | minimal number of permutations for the "multilevel" method |
| `maxPerm` | maximal number of permutations for the "multilevel" method |
| `pvalThreshold` | The p-value threshold for the "multilevel" method |

### Value

gseaResult object

**Aliases:** `gson_Reactome`

**Canonical source:** `repo/man/gson_Reactome.Rd`

## `gson_Reactome`: gson_Reactome

### Description

download the latest version of Reactome and stored in a 'GSON' object

### Usage

```r
gson_Reactome(organism = "human")
```

### Arguments

| Argument | Description |
| --- | --- |
| `organism` | one of "human", "rat", "mouse", "celegans", "yeast", "zebrafish", "fly". |

### Value

a 'GSON' object

### Examples

```r
## Not run:
rec_gson <- gson_Reactome("human")

## End(Not run)
```

**Aliases:** `ReactomePA`, `ReactomePA-package`

**Canonical source:** `repo/man/ReactomePA-package.Rd`

## `ReactomePA-package`: ReactomePA: Reactome Pathway Analysis

### Description

This package provides functions for pathway analysis based on REACTOME pathway database. It
implements enrichment analysis, gene set enrichment analysis and several functions for
visualization. This package is not affiliated with the Reactome team.

### See Also

Useful links:

- <https://yulab-smu.top/contribution-knowledge-mining/>

- Report bugs at <https://github.com/GuangchuangYu/ReactomePA/issues>

**Aliases:** `reexports`, `geneID`, `geneInCategory`, `cnetplot`, `dotplot`, `emapplot`, `gseaplot`,
`heatplot`, `ridgeplot`

**Canonical source:** `repo/man/reexports.Rd`

## `reexports`: Objects exported from other packages

### Description

These objects are imported from other packages. Follow the links below to see their documentation.

enrichit
`geneID`, `geneInCategory`

enrichplot
`cnetplot`, `dotplot`, `emapplot`, `gseaplot`, `heatplot`, `ridgeplot`

**Aliases:** `viewPathway`

**Canonical source:** `repo/man/viewPathway.Rd`

## `viewPathway`: viewPathway

### Description

view reactome pathway

### Usage

```r
viewPathway(
  pathName,
  organism = "human",
  readable = TRUE,
  foldChange = NULL,
  keyType = "ENTREZID",
  layout = "kk"
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `pathName` | pathway Name |
| `organism` | supported organism |
| `readable` | logical |
| `foldChange` | fold change |
| `keyType` | keyType of gene ID (i.e. names of foldChange, if available) |
| `layout` | graph layout |

### Details

plotting reactome pathway

### Value

plot
