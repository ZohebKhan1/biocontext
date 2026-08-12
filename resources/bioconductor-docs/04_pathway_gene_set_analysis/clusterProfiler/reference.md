# clusterProfiler API reference

Generated from the canonical package `man/*.Rd` sources. Package version `4.21.0`; 51 reference
topics.

**Aliases:** `append_kegg_category`

**Canonical source:** `repo/man/append_kegg_category.Rd`

## `append_kegg_category`: append_kegg_category

### Description

add KEGG pathway category information

### Usage

```r
append_kegg_category(x)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | KEGG enrichment result |

### Details

This function appends the KEGG pathway category information to KEGG enrichment result (either output
of 'enrichKEGG' or 'gseKEGG'

### Value

update KEGG enrichment result with category information

**Aliases:** `bitr_kegg`

**Canonical source:** `repo/man/bitr_kegg.Rd`

## `bitr_kegg`: bitr_kegg

### Description

convert biological ID using KEGG API

### Usage

```r
bitr_kegg(geneID, fromType, toType, organism, drop = TRUE)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneID` | input gene id |
| `fromType` | input id type |
| `toType` | output id type |
| `organism` | supported organism, can be search using search_kegg_organism function |
| `drop` | drop NA or not |

### Value

data.frame

**Aliases:** `bitr`

**Canonical source:** `repo/man/bitr.Rd`

## `bitr`: bitr

### Description

Biological Id TRanslator

### Usage

```r
bitr(geneID, fromType, toType, OrgDb, drop = TRUE)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneID` | input gene id |
| `fromType` | input id type |
| `toType` | output id type |
| `OrgDb` | annotation db |
| `drop` | drop NA or not |

### Value

data.frame

**Aliases:** `browseKEGG`

**Canonical source:** `repo/man/browseKEGG.Rd`

## `browseKEGG`: browseKEGG

### Description

open KEGG pathway with web browser

### Usage

```r
browseKEGG(x, pathID)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | an instance of enrichResult or gseaResult |
| `pathID` | pathway ID |

### Value

url

**Aliases:** `clusterProfiler`, `clusterProfiler-package`

**Canonical source:** `repo/man/clusterProfiler-package.Rd`

## `clusterProfiler-package`: clusterProfiler: A Universal Enrichment Tool for Interpreting Omics Data

### Description

A universal tool for interpreting functional characteristics of omics data. It supports
Over-Representation Analysis (ORA) and Gene Set Enrichment Analysis (GSEA) for both coding and
non-coding genomics data of thousands of species. It provides a unified and tidy interface to
access, manipulate, and visualize enrichment results. A key capability is the simultaneous analysis
and comparison of datasets from multiple treatments or time points. Furthermore, it integrates Large
Language Model (LLM) capabilities to provide automated and insightful interpretation of enrichment
results.

### See Also

Useful links:

- <https://yulab-smu.top/contribution-knowledge-mining/>

- Report bugs at <https://github.com/YuLab-SMU/clusterProfiler/issues>

**Aliases:** `compareCluster`

**Canonical source:** `repo/man/compareCluster.Rd`

## `compareCluster`: Compare gene clusters functional profile

### Description

Given a list of gene set, this function will compute profiles of each gene cluster.

### Usage

```r
compareCluster(
  geneClusters,
  fun = "enrichGO",
  data = "",
  source_from = NULL,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneClusters` | a list of entrez gene id. Alternatively, a formula of type `Entrez~group` or a formula of type `Entrez | logFC ~ group` for "gseGO", "gseKEGG" and "GSEA". |
| `fun` | One of "groupGO", "enrichGO", "enrichKEGG", "enrichDO" or "enrichPathway". Users can also supply their own function. |
| `data` | if geneClusters is a formula, the data from which the clusters must be extracted. |
| `source_from` | If using a custom function in "fun", provide the source package as a string here. Otherwise, the function will be obtained from the global environment. |
| `...` | Other arguments. |

### Value

A `clusterProfResult` instance.

### See Also

\[compareClusterResult-class\], \[groupGO\], \[enrichGO\], \[enrichKEGG\],
\[enrichDO\]\[DOSE::enrichDO\], \[enrichPathway\]\[ReactomePA::enrichPathway\]

### Examples

```r
## Not run:
data(gcSample)
xx <- compareCluster(gcSample, fun="enrichKEGG",
                     organism="hsa", pvalueCutoff=0.05)
as.data.frame(xx)
# plot(xx, type="dot", caption="KEGG Enrichment Comparison")
dotplot(xx)

## formula interface
mydf <- data.frame(Entrez=c('1', '100', '1000', '100101467',
                            '100127206', '100128071'),
                   logFC = c(1.1, -0.5, 5, 2.5, -3, 3),
                   group = c('A', 'A', 'A', 'B', 'B', 'B'),
                   othergroup = c('good', 'good', 'bad', 'bad', 'good', 'bad'))
xx.formula <- compareCluster(Entrez~group, data=mydf,
                             fun='groupGO', OrgDb='org.Hs.eg.db')
as.data.frame(xx.formula)

## formula interface with more than one grouping variable
xx.formula.twogroups <- compareCluster(Entrez~group+othergroup, data=mydf,
                                       fun='groupGO', OrgDb='org.Hs.eg.db')
as.data.frame(xx.formula.twogroups)

## End(Not run)
```

**Aliases:** `DataSet`, `gcSample`, `kegg_species`, `kegg_category`, `DE_GSE8057`

**Canonical source:** `repo/man/DataSet.Rd`

## `DataSet`: Datasets gcSample contains a sample of gene clusters.

### Description

Datasets gcSample contains a sample of gene clusters.

Datasets kegg_species contains kegg species information

Datasets kegg_category contains kegg pathway category information

Datasets DE_GSE8057 contains differential epxressed genes obtained from GSE8057 dataset

**Aliases:** `download_KEGG`

**Canonical source:** `repo/man/download_KEGG.Rd`

## `download_KEGG`: download_KEGG

### Description

download the latest version of KEGG pathway/module

### Usage

```r
download_KEGG(species, keggType = "KEGG", keyType = "kegg")
```

### Arguments

| Argument | Description |
| --- | --- |
| `species` | species |
| `keggType` | one of 'KEGG' or 'MKEGG' |
| `keyType` | supported keyType, see bitr_kegg |

### Value

list

**Aliases:** `dropGO`

**Canonical source:** `repo/man/dropGO.Rd`

## `dropGO`: dropGO

### Description

drop GO term of specific level or specific terms (mostly too general).

### Usage

```r
dropGO(x, level = NULL, term = NULL)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | an instance of 'enrichResult' or 'compareClusterResult' |
| `level` | GO level |
| `term` | GO term |

### Value

modified version of x

**Aliases:** `enrichDAVID`

**Canonical source:** `repo/man/enrichDAVID.Rd`

## `enrichDAVID`: enrichDAVID

### Description

enrichment analysis by DAVID

### Usage

```r
enrichDAVID(
  gene,
  idType = "ENTREZ_GENE_ID",
  universe,
  minGSSize = 10,
  maxGSSize = 500,
  annotation = "GOTERM_BP_FAT",
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  qvalueCutoff = 0.2,
  species = NA,
  david.user
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | input gene |
| `idType` | id type |
| `universe` | background genes. If missing, the all genes listed in the database (eg TERM2GENE table) will be used as background. |
| `minGSSize` | minimal size of genes annotated for testing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `annotation` | david annotation |
| `pvalueCutoff` | adjusted pvalue cutoff on enrichment tests to report |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `qvalueCutoff` | qvalue cutoff on enrichment tests to report as significant. Tests must pass i) `pvalueCutoff` on unadjusted pvalues, ii) `pvalueCutoff` on adjusted pvalues and iii) `qvalueCutoff` on qvalues to be reported. |
| `species` | species |
| `david.user` | david user |

### Value

A `enrichResult` instance

**Aliases:** `enricher`

**Canonical source:** `repo/man/enricher.Rd`

## `enricher`: enricher

### Description

A universal enrichment analyzer

### Usage

```r
enricher(
  gene,
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  universe = NULL,
  minGSSize = 10,
  maxGSSize = 500,
  qvalueCutoff = 0.2,
  gson = NULL,
  TERM2GENE,
  TERM2NAME = NA
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of gene id |
| `pvalueCutoff` | adjusted pvalue cutoff on enrichment tests to report |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `universe` | background genes. If missing, the all genes listed in the database (eg TERM2GENE table) will be used as background. |
| `minGSSize` | minimal size of genes annotated for testing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `qvalueCutoff` | qvalue cutoff on enrichment tests to report as significant. Tests must pass i) `pvalueCutoff` on unadjusted pvalues, ii) `pvalueCutoff` on adjusted pvalues and iii) `qvalueCutoff` on qvalues to be reported. |
| `gson` | a GSON object, if not NULL, use it as annotation data. |
| `TERM2GENE` | user input annotation of TERM TO GENE mapping, a data.frame of 2 column with term and gene. Only used when gson is NULL. |
| `TERM2NAME` | user input of TERM TO NAME mapping, a data.frame of 2 column with term and name. Only used when gson is NULL. |

### Value

A `enrichResult` instance

**Aliases:** `enrichGO`

**Canonical source:** `repo/man/enrichGO.Rd`

## `enrichGO`: GO Enrichment Analysis of a gene set. Given a vector of genes, this function will return the enrichment GO categories after FDR control.

### Description

GO Enrichment Analysis of a gene set. Given a vector of genes, this function will return the
enrichment GO categories after FDR control.

### Usage

```r
enrichGO(
  gene,
  OrgDb,
  keyType = "ENTREZID",
  ont = "MF",
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  universe,
  qvalueCutoff = 0.2,
  minGSSize = 10,
  maxGSSize = 500,
  readable = FALSE,
  pool = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id. |
| `OrgDb` | OrgDb |
| `keyType` | keytype of input gene |
| `ont` | One of "BP", "MF", and "CC" subontologies, or "ALL" for all three. |
| `pvalueCutoff` | adjusted pvalue cutoff on enrichment tests to report |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `universe` | background genes. If missing, the all genes listed in the database (eg TERM2GENE table) will be used as background. |
| `qvalueCutoff` | qvalue cutoff on enrichment tests to report as significant. Tests must pass i) `pvalueCutoff` on unadjusted pvalues, ii) `pvalueCutoff` on adjusted pvalues and iii) `qvalueCutoff` on qvalues to be reported. |
| `minGSSize` | minimal size of genes annotated by Ontology term for testing. |
| `maxGSSize` | maximal size of genes annotated for testing |
| `readable` | whether mapping gene ID to gene Name |
| `pool` | If ont='ALL', whether pool 3 GO sub-ontologies |

### Value

An `enrichResult` instance.

### See Also

\[enrichResult-class\], \[compareCluster\]

### Examples

```r
## Not run:
  data(geneList, package = "DOSE")
    de <- names(geneList)[1:100]
    yy <- enrichGO(de, 'org.Hs.eg.db', ont="BP", pvalueCutoff=0.01)
    head(yy)

## End(Not run)
```

**Aliases:** `enrichKEGG`

**Canonical source:** `repo/man/enrichKEGG.Rd`

## `enrichKEGG`: KEGG Enrichment Analysis of a gene set. Given a vector of genes, this function will return the enrichment KEGG categories with FDR control.

### Description

KEGG Enrichment Analysis of a gene set. Given a vector of genes, this function will return the
enrichment KEGG categories with FDR control.

### Usage

```r
enrichKEGG(
  gene,
  organism = "hsa",
  keyType = "kegg",
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  universe,
  minGSSize = 10,
  maxGSSize = 500,
  qvalueCutoff = 0.2,
  use_internal_data = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id. |
| `organism` | supported organism listed in 'https://www.genome.jp/kegg/catalog/org_list.html' |
| `keyType` | one of "kegg", 'ncbi-geneid', 'ncbi-proteinid' and 'uniprot' |
| `pvalueCutoff` | adjusted pvalue cutoff on enrichment tests to report |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `universe` | background genes. If missing, the all genes listed in the database (eg TERM2GENE table) will be used as background. |
| `minGSSize` | minimal size of genes annotated by Ontology term for testing. |
| `maxGSSize` | maximal size of genes annotated for testing |
| `qvalueCutoff` | qvalue cutoff on enrichment tests to report as significant. Tests must pass i) `pvalueCutoff` on unadjusted pvalues, ii) `pvalueCutoff` on adjusted pvalues and iii) `qvalueCutoff` on qvalues to be reported. |
| `use_internal_data` | logical, use KEGG.db or latest online KEGG data |

### Value

A `enrichResult` instance.

### See Also

\[enrichResult-class\], \[compareCluster\]

### Examples

```r
## Not run:
  data(geneList, package='DOSE')
  de <- names(geneList)[1:100]
  yy <- enrichKEGG(de, pvalueCutoff=0.01)
  head(yy)

## End(Not run)
```

**Aliases:** `enrichMKEGG`

**Canonical source:** `repo/man/enrichMKEGG.Rd`

## `enrichMKEGG`: KEGG Module Enrichment Analysis of a gene set. Given a vector of genes, this function will return the enrichment KEGG Module categories with FDR control.

### Description

KEGG Module Enrichment Analysis of a gene set. Given a vector of genes, this function will return
the enrichment KEGG Module categories with FDR control.

### Usage

```r
enrichMKEGG(
  gene,
  organism = "hsa",
  keyType = "kegg",
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  universe,
  minGSSize = 10,
  maxGSSize = 500,
  qvalueCutoff = 0.2
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id. |
| `organism` | supported organism listed in 'https://www.genome.jp/kegg/catalog/org_list.html' |
| `keyType` | one of "kegg", 'ncbi-geneid', 'ncbi-proteinid' and 'uniprot' |
| `pvalueCutoff` | adjusted pvalue cutoff on enrichment tests to report |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `universe` | background genes. If missing, the all genes listed in the database (eg TERM2GENE table) will be used as background. |
| `minGSSize` | minimal size of genes annotated by Ontology term for testing. |
| `maxGSSize` | maximal size of genes annotated for testing |
| `qvalueCutoff` | qvalue cutoff on enrichment tests to report as significant. Tests must pass i) `pvalueCutoff` on unadjusted pvalues, ii) `pvalueCutoff` on adjusted pvalues and iii) `qvalueCutoff` on qvalues to be reported. |

### Value

A `enrichResult` instance.

**Aliases:** `enrichPC`

**Canonical source:** `repo/man/enrichPC.Rd`

## `enrichPC`: enrichPC

### Description

ORA analysis for Pathway Commons

### Usage

```r
enrichPC(gene, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of genes (either hgnc symbols or uniprot IDs) |
| `...` | additional parameters, see also the parameters supported by the enricher() function |

### Details

This function performs over-representation analysis using Pathway Commons

### Value

A `enrichResult` instance

**Aliases:** `enrichWP`

**Canonical source:** `repo/man/enrichWP.Rd`

## `enrichWP`: enrichWP

### Description

ORA analysis for WikiPathways

### Usage

```r
enrichWP(gene, organism, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id |
| `organism` | supported organisms, which can be accessed via the get_wp_organisms() function |
| `...` | additional parameters, see also the parameters supported by the enricher() function |

### Details

This function performs over-representation analysis using WikiPathways

### Value

A `enrichResult` instance

**Aliases:** `get_wp_organisms`

**Canonical source:** `repo/man/get_wp_organisms.Rd`

## `get_wp_organisms`: get_wp_organism

### Description

list supported organism of WikiPathways

### Usage

```r
get_wp_organisms()
```

### Details

This function extracts information from 'https://data.wikipathways.org/current/gmt/' and lists all
supported organisms

### Value

supported organism list

**Aliases:** `getPPI`

**Canonical source:** `repo/man/getPPI.Rd`

## `getPPI`: getPPI

### Description

getPPI

### Usage

```r
getPPI(
  x,
  ID = 1,
  taxID = "auto",
  required_score = NULL,
  network_type = "functional",
  add_nodes = 0,
  show_query_node_labels = 0,
  output = "igraph"
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | an 'enrichResult“ object or a vector of proteins, e.g. 'c("PTCH1", "TP53", "BRCA1", "BRCA2")' |
| `ID` | ID or index to extract genes in the enriched term(s) if 'x' is an 'enrichResult' object |
| `taxID` | NCBI taxon identifiers (e.g. Human is 9606, see: \[STRING organisms\](https://string-db.org/cgi/input.pl?input_page_active_form=organisms). |
| `required_score` | threshold of significance to include a interaction, a number between 0 and 1000 (default depends on the network) |
| `network_type` | network type: functional (default), physical |
| `add_nodes` | adds a number of proteins with to the network based on their confidence score (default:1) |
| `show_query_node_labels` | when available use submitted names in the preferredName column when (0 or 1) (default:0) |
| `output` | one of 'data.frame' or 'igraph' |

### Details

\[Getting the STRING network
interactions\](https://string-db.org/cgi/help.pl?sessionId=btsvnCeNrBk7).

### Value

a 'data.frame' or an 'igraph' object

**Aliases:** `getTaxID`

**Canonical source:** `repo/man/getTaxID.Rd`

## `getTaxID`: getTaxID

### Description

Convert species scientific name to taxonomic ID

### Usage

```r
getTaxID(species)
```

### Arguments

| Argument | Description |
| --- | --- |
| `species` | scientific name of a species |

### Value

taxonomic ID

**Aliases:** `getTaxInfo`

**Canonical source:** `repo/man/getTaxInfo.Rd`

## `getTaxInfo`: getTaxInfo

### Description

Query taxonomy information from 'stringdb' or 'ensembl' web services

### Usage

```r
getTaxInfo(species, source = "stringdb")
```

### Arguments

| Argument | Description |
| --- | --- |
| `species` | scientific name of a species |
| `source` | one of 'stringdb' or 'ensembl' |

### Value

a 'data.frame' of query information

**Aliases:** `Gff2GeneTable`

**Canonical source:** `repo/man/Gff2GeneTable.Rd`

## `Gff2GeneTable`: Gff2GeneTable

### Description

read GFF file and build gene information table

### Usage

```r
Gff2GeneTable(gffFile, compress = TRUE)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gffFile` | GFF file |
| `compress` | compress file or not |

### Details

given a GFF file, this function extracts information from it and save it in working directory

### Value

file save.

**Aliases:** `go2ont`

**Canonical source:** `repo/man/go2ont.Rd`

## `go2ont`: go2ont

### Description

convert goid to ontology (BP, CC, MF)

### Usage

```r
go2ont(goid)
```

### Arguments

| Argument | Description |
| --- | --- |
| `goid` | a vector of GO IDs |

### Value

data.frame

**Aliases:** `go2term`

**Canonical source:** `repo/man/go2term.Rd`

## `go2term`: go2term

### Description

convert goid to descriptive term

### Usage

```r
go2term(goid)
```

### Arguments

| Argument | Description |
| --- | --- |
| `goid` | a vector of GO IDs |

### Value

data.frame

**Aliases:** `gofilter`

**Canonical source:** `repo/man/gofilter.Rd`

## `gofilter`: gofilter

### Description

filter GO enriched result at specific level

### Usage

```r
gofilter(x, level = 4)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | output from enrichGO or compareCluster |
| `level` | GO level |

### Value

updated object

**Aliases:** `groupGO`

**Canonical source:** `repo/man/groupGO.Rd`

## `groupGO`: Functional Profile of a gene set at specific GO level. Given a vector of genes, this function will return the GO profile at a specific level.

### Description

Functional Profile of a gene set at specific GO level. Given a vector of genes, this function will
return the GO profile at a specific level.

### Usage

```r
groupGO(
  gene,
  OrgDb,
  keyType = "ENTREZID",
  ont = "CC",
  level = 2,
  readable = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `gene` | a vector of entrez gene id. |
| `OrgDb` | OrgDb |
| `keyType` | key type of input gene |
| `ont` | One of "MF", "BP", and "CC" subontologies. |
| `level` | Specific GO Level. |
| `readable` | if readable is TRUE, the gene IDs will mapping to gene symbols. |

### Value

A `groupGOResult` instance.

### See Also

\[groupGOResult-class\], \[compareCluster\]

### Examples

```r
    data(gcSample)
    yy <- groupGO(gcSample[[1]], 'org.Hs.eg.db', ont="BP", level=2)
    head(summary(yy))
    #plot(yy)
```

**Aliases:** `groupGOResult-class`, `show,groupGOResult-method`

**Canonical source:** `repo/man/groupGOResult-class.Rd`

## `groupGOResult-class`: Class "groupGOResult" This class represents the result of functional Profiles of a set of gene at specific GO level.

### Description

Class "groupGOResult" This class represents the result of functional Profiles of a set of gene at
specific GO level.

### Slots

`result`
GO classification result

`ontology`
Ontology

`level`
GO level

`organism`
one of "human", "mouse" and "yeast"

`gene`
Gene IDs

`readable`
logical flag of gene ID in symbol or not.

### See Also

\[compareClusterResult\], \[compareCluster\], \[groupGO\]

**Aliases:** `GSEA`

**Canonical source:** `repo/man/GSEA.Rd`

## `GSEA`: GSEA

### Description

a universal gene set enrichment analysis tools

### Usage

```r
GSEA(
  geneList,
  exponent = 1,
  minGSSize = 10,
  maxGSSize = 500,
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  gson = NULL,
  TERM2GENE,
  TERM2NAME = NA,
  verbose = TRUE,
  nPerm = 1000,
  method = "multilevel",
  adaptive = FALSE,
  minPerm = 101,
  maxPerm = 1e+05,
  pvalThreshold = 0.1,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | order ranked geneList |
| `exponent` | weight of each step |
| `minGSSize` | minimal size of each geneSet for analyzing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `pvalueCutoff` | adjusted pvalue cutoff |
| `pAdjustMethod` | one of "holm", "hochberg", "hommel", "bonferroni", "BH", "BY", "fdr", "none" |
| `gson` | a GSON object, if not NULL, use it as annotation data. |
| `TERM2GENE` | user input annotation of TERM TO GENE mapping, a data.frame of 2 column with term and gene. Only used when gson is NULL. |
| `TERM2NAME` | user input of TERM TO NAME mapping, a data.frame of 2 column with term and name. Only used when gson is NULL. |
| `verbose` | logical |
| `nPerm` | The number of permutations. |
| `method` | method of calculating the pvalue, one of "multilevel", "monte carlo" and "fgsea" |
| `adaptive` | logical, whether to use adaptive method for calculating pvalue |
| `minPerm` | minimal number of permutations for adaptive method |
| `maxPerm` | maximal number of permutations for adaptive method |
| `pvalThreshold` | pvalue threshold for adaptive method |
| `...` | other parameter |

### Value

gseaResult object

**Aliases:** `gseGO`

**Canonical source:** `repo/man/gseGO.Rd`

## `gseGO`: gseGO

### Description

Gene Set Enrichment Analysis of Gene Ontology

### Usage

```r
gseGO(
  geneList,
  ont = "BP",
  OrgDb,
  keyType = "ENTREZID",
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
  pvalThreshold = 0.1,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | order ranked geneList |
| `ont` | one of "BP", "MF", and "CC" subontologies, or "ALL" for all three. |
| `OrgDb` | OrgDb |
| `keyType` | keytype of gene |
| `exponent` | weight of each step |
| `minGSSize` | minimal size of each geneSet for analyzing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `pvalueCutoff` | pvalue Cutoff |
| `pAdjustMethod` | pvalue adjustment method |
| `verbose` | print message or not |
| `nPerm` | The number of permutations. |
| `method` | method of calculating the pvalue, one of "multilevel", "monte carlo" and "fgsea" |
| `adaptive` | logical, whether to use adaptive method for calculating pvalue |
| `minPerm` | minimal number of permutations for adaptive method |
| `maxPerm` | maximal number of permutations for adaptive method |
| `pvalThreshold` | pvalue threshold for adaptive method |
| `...` | other parameter |

### Value

gseaResult object

**Aliases:** `gseKEGG`

**Canonical source:** `repo/man/gseKEGG.Rd`

## `gseKEGG`: gseKEGG

### Description

Gene Set Enrichment Analysis of KEGG

### Usage

```r
gseKEGG(
  geneList,
  organism = "hsa",
  keyType = "kegg",
  exponent = 1,
  minGSSize = 10,
  maxGSSize = 500,
  pvalueCutoff = 0.05,
  pAdjustMethod = "BH",
  verbose = TRUE,
  use_internal_data = FALSE,
  nPerm = 1000,
  method = "multilevel",
  adaptive = FALSE,
  minPerm = 101,
  maxPerm = 1e+05,
  pvalThreshold = 0.1,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | order ranked geneList |
| `organism` | supported organism listed in 'https://www.genome.jp/kegg/catalog/org_list.html' |
| `keyType` | one of "kegg", 'ncbi-geneid', 'ncib-proteinid' and 'uniprot' |
| `exponent` | weight of each step |
| `minGSSize` | minimal size of each geneSet for analyzing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `pvalueCutoff` | pvalue Cutoff |
| `pAdjustMethod` | pvalue adjustment method |
| `verbose` | print message or not |
| `use_internal_data` | logical, use KEGG.db or latest online KEGG data |
| `nPerm` | The number of permutations. |
| `method` | method of calculating the pvalue, one of "multilevel", "monte carlo" and "fgsea" |
| `adaptive` | logical, whether to use adaptive method for calculating pvalue |
| `minPerm` | minimal number of permutations for adaptive method |
| `maxPerm` | maximal number of permutations for adaptive method |
| `pvalThreshold` | pvalue threshold for adaptive method |
| `...` | other parameter |

### Value

gseaResult object

**Aliases:** `gseMKEGG`

**Canonical source:** `repo/man/gseMKEGG.Rd`

## `gseMKEGG`: gseMKEGG

### Description

Gene Set Enrichment Analysis of KEGG Module

### Usage

```r
gseMKEGG(
  geneList,
  organism = "hsa",
  keyType = "kegg",
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
  pvalThreshold = 0.1,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | order ranked geneList |
| `organism` | supported organism listed in 'https://www.genome.jp/kegg/catalog/org_list.html' |
| `keyType` | one of "kegg", 'ncbi-geneid', 'ncib-proteinid' and 'uniprot' |
| `exponent` | weight of each step |
| `minGSSize` | minimal size of each geneSet for analyzing |
| `maxGSSize` | maximal size of genes annotated for testing |
| `pvalueCutoff` | pvalue Cutoff |
| `pAdjustMethod` | pvalue adjustment method |
| `verbose` | print message or not |
| `nPerm` | The number of permutations. |
| `method` | method of calculating the pvalue, one of "multilevel", "monte carlo" and "fgsea" |
| `adaptive` | logical, whether to use adaptive method for calculating pvalue |
| `minPerm` | minimal number of permutations for adaptive method |
| `maxPerm` | maximal number of permutations for adaptive method |
| `pvalThreshold` | pvalue threshold for adaptive method |
| `...` | other parameter |

### Value

gseaResult object

**Aliases:** `gsePC`

**Canonical source:** `repo/man/gsePC.Rd`

## `gsePC`: gsePC

### Description

GSEA analysis for Pathway Commons

### Usage

```r
gsePC(geneList, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | a ranked gene list |
| `...` | additional parameters, see also the parameters supported by the GSEA() function |

### Details

This function performs GSEA using Pathway Commons

### Value

A `gseaResult` instance

**Aliases:** `gseWP`

**Canonical source:** `repo/man/gseWP.Rd`

## `gseWP`: gseWP

### Description

GSEA analysis for WikiPathways

### Usage

```r
gseWP(geneList, organism, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `geneList` | ranked gene list |
| `organism` | supported organisms, which can be accessed via the get_wp_organisms() function |
| `...` | additional parameters, see also the parameters supported by the GSEA() function |

### Details

This function performs GSEA using WikiPathways

### Value

A `gseaResult` instance

**Aliases:** `gson_GO_local`

**Canonical source:** `repo/man/gson_GO_local.Rd`

## `gson_GO_local`: Build a gson object that annotate Gene Ontology

### Description

Build a gson object that annotate Gene Ontology

### Usage

```r
gson_GO_local(data, ont = c("ALL", "BP", "CC", "MF"), species = NULL, ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `data` | a two-column data.frame of original GO annotation. The columns are "gene_id" and "go_id". |
| `ont` | type of GO annotation, which is "ALL", "BP", "MF", or "CC". default: "ALL". |
| `species` | name of species. Default: NULL. |
| `...` | pass to 'gson::gson()' constructor. |

### Value

a 'gson' instance

### Examples

```r
 data = data.frame(gene_id = "gene1",
                   go_id = c("GO:0035492", "GO:0009764", "GO:0031040", "GO:0033714", "GO:0036349"))
 gson_GO_local(data, species = "E. coli")
```

**Aliases:** `gson_GO`

**Canonical source:** `repo/man/gson_GO.Rd`

## `gson_GO`: gson_KEGG

### Description

download the latest version of KEGG pathway and stored in a 'GSON' object

### Usage

```r
gson_GO(OrgDb, keytype = "ENTREZID", ont = "BP")
```

### Arguments

| Argument | Description |
| --- | --- |
| `OrgDb` | OrgDb |
| `keytype` | keytype of genes. |
| `ont` | one of "BP", "MF", "CC", and "ALL" |

### Value

a 'GSON' object

**Aliases:** `gson_KEGG_mapper`

**Canonical source:** `repo/man/gson_KEGG_mapper.Rd`

## `gson_KEGG_mapper`: Build KEGG annotation for novel species using KEGG Mapper

### Description

KEGG Mapper service can annotate protein sequences for novel species with KO database, and KO
annotation need to be converted into Pathway or Module annotation, which can then be used in
'clusterProfiler'

### Usage

```r
gson_KEGG_mapper(
  file,
  format = c("BLAST", "Ghost", "Kofam"),
  type = c("pathway", "module"),
  species = NULL,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `file` | the name of the file which comes from the KEGG Mapper service, see Details for file format |
| `format` | string indicate format of KEGG Mapper result |
| `type` | string indicate annotation database |
| `species` | your species, NULL if ignored |
| `...` | pass to gson::gson() |

### Details

File is a two-column dataset with K numbers in the second column, optionally preceded by the user's
identifiers in the first column. This is consistent with the output files of automatic annotation
servers, BlastKOALA, GhostKOALA, and KofamKOALA. KOALA (KEGG Orthology And Links Annotation) is
KEGG's internal annotation tool for K number assignment of KEGG GENES using SSEARCH computation.
BlastKOALA and GhostKOALA assign K numbers to the user's sequence data by BLAST and GHOSTX searches,
respectively, against a nonredundant set of KEGG GENES. KofamKOALA is a new member of the KOALA
family available at GenomeNet using the HMM profile search, rather than the sequence similarity
search, for K number assignment. see https://www.kegg.jp/blastkoala/,
https://www.kegg.jp/ghostkoala/ and https://www.genome.jp/tools/kofamkoala/ for more information.

### Value

a gson instance

### Examples

```r
## Not run:
 file = system.file('extdata', "kegg_mapper_blast.txt", package='clusterProfiler')
 gson_KEGG_mapper(file, format = "BLAST", type = "pathway")

## End(Not run)
```

**Aliases:** `gson_KEGG`

**Canonical source:** `repo/man/gson_KEGG.Rd`

## `gson_KEGG`: gson_KEGG

### Description

download the latest version of KEGG pathway and stored in a 'GSON' object

### Usage

```r
gson_KEGG(species, KEGG_Type = "KEGG", keyType = "kegg")
```

### Arguments

| Argument | Description |
| --- | --- |
| `species` | species |
| `KEGG_Type` | one of "KEGG" and "MKEGG" |
| `keyType` | one of "kegg", 'ncbi-geneid', 'ncib-proteinid' and 'uniprot'. |

### Value

a 'GSON' object

**Aliases:** `gson_WP`

**Canonical source:** `repo/man/gson_WP.Rd`

## `gson_WP`: gson_WP

### Description

Download the latest version of WikiPathways data and stored in a 'GSON' object

### Usage

```r
gson_WP(organism)
```

### Arguments

| Argument | Description |
| --- | --- |
| `organism` | supported organism, which can be accessed via the get_wp_organisms() function. |

**Aliases:** `idType`

**Canonical source:** `repo/man/idType.Rd`

## `idType`: idType

### Description

list ID types supported by annoDb

### Usage

```r
idType(OrgDb = "org.Hs.eg.db")
```

### Arguments

| Argument | Description |
| --- | --- |
| `OrgDb` | annotation db |

### Value

character vector

**Aliases:** `infer_model_id`

**Canonical source:** `repo/man/infer_model_id.Rd`

## `infer_model_id`: Infer Model ID

### Description

Maps bare model names to the aisdk 'provider:model' format for backward compatibility. Emits a
warning when guessing and suggests the explicit form. If the model already contains a colon, it is
returned as-is.

### Usage

```r
infer_model_id(model)
```

### Arguments

| Argument | Description |
| --- | --- |
| `model` | A model string, either bare (e.g., "deepseek-chat") or fully qualified (e.g., "deepseek:deepseek-chat"). |

### Value

A string in 'provider:model' format.

**Aliases:** `interpret_agent`

**Canonical source:** `repo/man/interpret_agent.Rd`

## `interpret_agent`: Interpret enrichment results using a multi-agent pipeline (Deep Mode)

### Description

Employs three specialized AI agents in sequence for rigorous interpretation:

1. Agent Cleaner: Filters noise and selects relevant pathways.

2. Agent Detective: Identifies key regulators and functional modules.

3. Agent Synthesizer: Produces a coherent biological narrative.

### Usage

```r
interpret_agent(
  x,
  context = NULL,
  n_pathways = 50,
  model = NULL,
  add_ppi = FALSE,
  gene_fold_change = NULL,
  max_tokens = 8192,
  temperature = 0.3,
  verbose = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | An enrichment result object. |
| `context` | A string describing the experimental background. |
| `n_pathways` | Number of top pathways to consider initially. Default 50. |
| `model` | Optional LLM model. When 'NULL' (default), uses the aisdk package-wide default model configured via 'aisdk::set_model()'. You can also supply a model ID in 'provider:model' format or a 'LanguageModelV1' object. Bare model names are supported with a warning. |
| `add_ppi` | Logical, whether to query PPI data. Default FALSE. |
| `gene_fold_change` | Named numeric vector of log fold changes. |
| `max_tokens` | Maximum tokens per agent call. Default 8192. |
| `temperature` | Sampling temperature. Default 0.3. |
| `verbose` | Logical, whether to print debug messages. Default FALSE. |

### Details

Uses aisdk's Agent and Session system for shared context across agents.

### Value

An 'interpretation' object with deep analysis fields plus regulatory_drivers, refined_network, and
network_evidence from the detective agent.

### Examples

```r
## Not run:
res <- interpret_agent(df,
  model = "openai:gpt-4o",
  context = "scRNA-seq of mouse MI day 3"
)
print(res)

## End(Not run)
```

**Aliases:** `interpret_hierarchical`

**Canonical source:** `repo/man/interpret_hierarchical.Rd`

## `interpret_hierarchical`: Interpret enrichment results using a hierarchical strategy

### Description

First interprets major clusters to establish lineage context, then interprets sub-clusters with
hierarchical constraints from the major cluster annotations.

### Usage

```r
interpret_hierarchical(
  x_minor,
  x_major,
  mapping,
  model = NULL,
  task = "cell_type",
  max_tokens = 8192,
  temperature = 0.3
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x_minor` | Enrichment result for sub-clusters. |
| `x_major` | Enrichment result for major clusters. |
| `mapping` | A named vector mapping sub-cluster IDs to major cluster IDs. |
| `model` | Optional LLM model. When 'NULL' (default), uses the aisdk package-wide default model configured via 'aisdk::set_model()'. You can also supply a model ID in 'provider:model' format or a 'LanguageModelV1' object. Bare model names are supported with a warning. |
| `task` | Task type, default "cell_type". |
| `max_tokens` | Maximum tokens. Default 8192. |
| `temperature` | Sampling temperature. Default 0.3. |

### Value

An 'interpretation_list' object.

**Aliases:** `interpret`

**Canonical source:** `repo/man/interpret.Rd`

## `interpret`: Interpret Enrichment Results Using LLMs

### Description

Functions for interpreting functional enrichment analysis results using Large Language Models.
Supports single-call interpretation, multi-agent deep analysis, and hierarchical cluster strategies.

Built on top of aisdk's 'generate_object()' for reliable structured output, and the Agent/Session
system for multi-agent pipelines.

Sends enrichment results along with optional experimental context to an LLM to generate a structured
biological interpretation, hypothesis, and narrative suitable for a publication.

### Usage

```r
interpret(
  x,
  context = NULL,
  n_pathways = 20,
  model = NULL,
  task = "interpretation",
  prior = NULL,
  add_ppi = FALSE,
  gene_fold_change = NULL,
  max_tokens = 8192,
  temperature = 0.3,
  verbose = FALSE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | An enrichment result object ('enrichResult', 'gseaResult', 'compareClusterResult', or a 'data.frame' with pathway columns). |
| `context` | A string describing the experimental background (e.g., "scRNA-seq of mouse myocardial infarction at day 3"). |
| `n_pathways` | Number of top significant pathways to include. Default 20. |
| `model` | Optional LLM model. When 'NULL' (default), uses the aisdk package-wide default model configured via 'aisdk::set_model()'. You can also supply a model ID in 'provider:model' format (e.g., '"deepseek:deepseek-chat"', '"gemini:gemini-2.5-flash"') or a 'LanguageModelV1' object. Bare model names are supported with a warning (e.g., '"deepseek-chat"'). |
| `task` | Task type: "interpretation" (default), "cell_type"/"annotation", or "phenotype"/"phenotyping". |
| `prior` | Optional prior knowledge or preliminary annotation to guide the task. |
| `add_ppi` | Logical, whether to query STRING PPI network data. Default FALSE. |
| `gene_fold_change` | Named numeric vector of log fold changes for expression context. |
| `max_tokens` | Maximum tokens for the LLM response. Default 8192. Some models (especially reasoning models) may need much higher values (e.g., 16384 or more) to produce complete structured output. |
| `temperature` | Sampling temperature. Default 0.3. |
| `verbose` | Logical, whether to print debug messages showing raw API responses, token usage, and JSON parsing details. Default FALSE. Equivalent to setting 'options(aisdk.debug = TRUE)' for the call. |

### Details

Uses 'generate_object()' internally for reliable structured output with automatic JSON repair,
eliminating manual parsing failures.

### Value

An 'interpretation' object (list) with task-specific fields. For "interpretation": overview,
key_mechanisms, hypothesis, narrative, etc. For "annotation": cell_type, confidence, reasoning,
markers, etc. For "phenotype": phenotype, confidence, reasoning, key_processes, etc.

### Examples

```r
## Not run:
# Basic usage with a data frame
df <- data.frame(
  ID = c("GO:0006915", "GO:0008284"),
  Description = c("apoptotic process", "positive regulation of proliferation"),
  GeneRatio = c("10/100", "20/100"),
  p.adjust = c(0.01, 0.02),
  geneID = c("TP53/BAX", "MYC/CCND1/CDK4")
)
res <- interpret(df,
  model = "deepseek:deepseek-chat",
  context = "Cancer proliferation study"
)
# Reuse aisdk's global default model
# aisdk::set_model("openai:gpt-4o-mini")
# res <- interpret(df, context = "Cancer proliferation study")
print(res)

## End(Not run)
```

**Aliases:** `ko2name`

**Canonical source:** `repo/man/ko2name.Rd`

## `ko2name`: ko2name

### Description

convert ko ID to descriptive name

### Usage

```r
ko2name(ko)
```

### Arguments

| Argument | Description |
| --- | --- |
| `ko` | ko ID |

### Value

data.frame

**Aliases:** `merge_result`

**Canonical source:** `repo/man/merge_result.Rd`

## `merge_result`: merge_result

### Description

merge a list of enrichResult objects to compareClusterResult

### Usage

```r
merge_result(enrichResultList)
```

### Arguments

| Argument | Description |
| --- | --- |
| `enrichResultList` | a list of enrichResult objects |

### Value

a compareClusterResult instance

**Aliases:** `plot.interpretation`

**Canonical source:** `repo/man/plot.interpretation.Rd`

## `plot.interpretation`: plot

### Description

plot

### Usage

```r
## S3 method for class 'interpretation'
plot(x, layout = "nicely", ...)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | An 'interpretation' object. |
| `layout` | Graph layout, default is "nicely". |
| `...` | Additional arguments passed to 'ggplot2::ggplot'. |

**Aliases:** `plotGOgraph`

**Canonical source:** `repo/man/plotGOgraph.Rd`

## `plotGOgraph`: plotGOgraph

### Description

plot GO graph

### Usage

```r
plotGOgraph(
  x,
  firstSigNodes = 10,
  useInfo = "all",
  sigForAll = TRUE,
  useFullNames = TRUE,
  ...
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | output of enrichGO or gseGO |
| `firstSigNodes` | number of significant nodes (retangle nodes in the graph) |
| `useInfo` | additional info |
| `sigForAll` | if TRUE the score/p-value of all nodes in the DAG is shown, otherwise only score will be shown |
| `useFullNames` | logical |
| `...` | additional parameter of showSigOfNodes, please refer to topGO |

### Value

GO DAG graph

**Aliases:** `read.gmt.pc`

**Canonical source:** `repo/man/read.gmt.pc.Rd`

## `read.gmt.pc`: read.gmt.pc

### Description

Parse gmt file from Pathway Common

### Usage

```r
read.gmt.pc(gmtfile, output = "data.frame")
```

### Arguments

| Argument | Description |
| --- | --- |
| `gmtfile` | A gmt file |
| `output` | one of 'data.frame' or 'GSON' |

### Details

This function parse gmt file downloaded from Pathway common

### Value

A data.frame or A GSON object depends on the value of 'output'

**Aliases:** `reexports`, `geneID`, `geneInCategory`, `gsfilter`, `setReadable`, `cnetplot`,
`dotplot`, `emapplot`, `goplot`, `gseaplot`, `heatplot`, `ridgeplot`, `read.gaf`, `read.blast2go`,
`buildGOmap`, `\%>\%`, `\%<>\%`, `read.gmt`, `read.gmt.wp`, `arrange`, `filter`, `group_by`,
`mutate`, `n`, `rename`, `select`, `slice`, `summarise`, `get_organism`

**Canonical source:** `repo/man/reexports.Rd`

## `reexports`: Objects exported from other packages

### Description

These objects are imported from other packages. Follow the links below to see their documentation.

dplyr
`arrange`, `filter`, `group_by`, `mutate`, `n`, `rename`, `select`, `slice`, `summarise`

enrichit
`geneID`, `geneInCategory`, `gsfilter`, `setReadable`

enrichplot
`cnetplot`, `dotplot`, `emapplot`, `goplot`, `gseaplot`, `heatplot`, `ridgeplot`

GOSemSim
`buildGOmap`, `get_organism`, `read.blast2go`, `read.gaf`

gson
`read.gmt`, `read.gmt.wp`

magrittr

**Aliases:** `search_kegg_organism`

**Canonical source:** `repo/man/search_kegg_organism.Rd`

## `search_kegg_organism`: search_kegg_organism

### Description

search kegg organism, listed in https://www.genome.jp/kegg/catalog/org_list.html

### Usage

```r
search_kegg_organism(
  str,
  by = "scientific_name",
  ignore.case = FALSE,
  use_internal_data = TRUE
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `str` | string |
| `by` | one of 'kegg.code', 'scientific_name' and 'common_name' |
| `ignore.case` | TRUE or FALSE |
| `use_internal_data` | logical, use kegg_species.rda or latest online KEGG data |

### Value

data.frame

**Aliases:** `simplify`, `simplify,enrichResult-method`, `simplify,gseaResult-method`,
`simplify,compareClusterResult-method`

**Canonical source:** `repo/man/simplify-methods.Rd`

## `simplify`: simplify method

### Description

simplify output from enrichGO and gseGO by removing redundancy of enriched GO terms

simplify output from compareCluster by removing redundancy of enriched GO terms

### Usage

```r
## S4 method for signature 'enrichResult'
simplify(
  x,
  cutoff = 0.7,
  by = "p.adjust",
  select_fun = min,
  measure = "Wang",
  semData = NULL
)

## S4 method for signature 'gseaResult'
simplify(
  x,
  cutoff = 0.7,
  by = "p.adjust",
  select_fun = min,
  measure = "Wang",
  semData = NULL
)

## S4 method for signature 'compareClusterResult'
simplify(
  x,
  cutoff = 0.7,
  by = "p.adjust",
  select_fun = min,
  measure = "Wang",
  semData = NULL
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `x` | output of enrichGO |
| `cutoff` | similarity cutoff |
| `by` | feature to select representative term, selected by 'select_fun' function |
| `select_fun` | function to select feature passed by 'by' parameter |
| `measure` | method to measure similarity |
| `semData` | GOSemSimDATA object |

### Value

updated enrichResult object

updated compareClusterResult object

**Aliases:** `uniprot_get`

**Canonical source:** `repo/man/uniprot_get.Rd`

## `uniprot_get`: uniprot_get

### Description

retreve annotation data from uniprot

### Usage

```r
uniprot_get(taxID)
```

### Arguments

| Argument | Description |
| --- | --- |
| `taxID` | taxonomy ID |

### Value

gene table data frame
