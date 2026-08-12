# tximeta: transcript quantification import with automatic metadata

## Overview

*tximeta* performs numerous annotation and metadata gathering tasks on behalf of users during the
import of transcript counts and abundance from quantification tools such as salmon. Data are
imported as SummarizedExperiment objects with associated GenomicRanges metadata. Correct metadata is
added automatically via reference sequence digests, facilitating genomic analyses and assisting in
computational reproducibility. Addition functionality is now offered for quantification with mixed
reference transcripts, e.g. GENCODE plus novel transcripts.

If viewing vignette on Bioconductor, see
[here](https://thelovelab.github.io/tximeta/articles/tximeta.html) for a nicely rendered version.

# Introduction

The *tximeta* package extends the *tximport* package for import of transcript-level quantification
data into R/Bioconductor. It automatically adds annotation metadata when the RNA-seq data has been
quantified with *salmon* or related tools. To our knowledge, *tximeta* is the only package for
RNA-seq data import that can automatically identify and attach transcriptome metadata based on the
unique sequence collection of the reference transcripts. For more details on these packages --
including the motivation for *tximeta* and description of similar work -- consult the **References**
below.

**Note:** For details of using *tximeta* functions with
[oarfish](https://github.com/COMBINE-lab/oarfish), in particular with separate `--annotated` and
`--novel` reference transcripts, refer to [this section](#mixed-reference-transcripts) below.

**Note:** `tximeta()` requires that the **entire output** of the quantificaation tool is present in
the output directories and unmodified in order to identify the provenance of the reference
transcripts. In general, it's a good idea to not modify or re-arrange the output directory of
bioinformatic software as other downstream software often rely on and assume a consistent directory
structure. For sharing multiple samples, one can use, for example, `tar -czf` to bundle up a set of
*salmon* output directories. For tips on using `tximeta()` with other quantifiers see the [other
quantifiers](#other-quantifiers) section below.

# Preparing `tximeta` input

The first step using `tximeta()` is to read in the sample table, which will become the *column
data*, `colData`, of the final object, a *SummarizedExperiment*. The sample table should contain all
the information we need to identify the *salmon* quantification directories.

Here we will use a *salmon* quantification file in the *tximportData* package to demonstrate the
usage of `tximeta`. We do not have a sample table, so we construct one in R. It is recommended to
keep a sample table as a CSV or TSV file while working on an RNA-seq project with multiple samples.

```
dir <- system.file("extdata/salmon_dm", package="tximportData")
files <- file.path(dir, "SRR1197474", "quant.sf")
file.exists(files)
```

 ## TRUE

```
coldata <- data.frame(files, names="SRR1197474", condition="A", stringsAsFactors=FALSE)
coldata
```

 ## files
 ## 1 /home/biocbuild/bbs-3.22-bioc/R/site-library/tximportData/extdata/salmon_dm/SRR1197474/quant.sf
 ## names condition
 ## 1 SRR1197474 A

`tximeta()` expects at least two columns in `coldata`:

1. `files` - a pointer to the `quant.sf` files
2. `names` - the unique names that should be used to identify samples

Other columns will be propagated to `colData` of the *SummarizedExperiment* output.

# Running `tximeta`

Normally, we would just run `tximeta` like so:

```
library(tximeta)
se <- tximeta(coldata)
```

However, to avoid downloading remote GTF files during this vignette, we will point to a GTF file
saved locally (in the *tximportData* package). We link the transcriptome of the *salmon* index to
its locally saved GTF. The standard recommended usage of `tximeta()`,\
in particular for quantification with reference transcripts with a [pre-computed
digest](#pre-computed-digests), would be the code chunk above. If one were adding another set of
reference transcripts, one would normally specify a remote GTF source, not a local one. **This
following code is therefore not recommended for a typical workflow, but is particular to the
vignette code.**

```
indexDir <- file.path(dir, "Dm.BDGP6.22.98_salmon-0.14.1")
fastaFTP <- c("ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/cdna/Drosophila_melanogaster.BDGP6.22.cdna.all.fa.gz",
              "ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/ncrna/Drosophila_melanogaster.BDGP6.22.ncrna.fa.gz")
gtfPath <- file.path(dir,"Drosophila_melanogaster.BDGP6.22.98.gtf.gz")
suppressPackageStartupMessages(library(tximeta))
makeLinkedTxome(indexDir=indexDir,
                source="LocalEnsembl",
                organism="Drosophila melanogaster",
                release="98",
                genome="BDGP6.22",
                fasta=fastaFTP,
                gtf=gtfPath,
                write=FALSE)
```

 ## reading digest from indexDir: /home/biocbuild/bbs-3.22-bioc/R/site-library/tximportData/extdata/salmon_dm/Dm.BDGP6.22.98_salmon-0.14.1

 ## saving linkedTxome in bfc (first time)

```
library(tximeta)
se <- tximeta(coldata)
```

 ## importing salmon quantification files

 ## reading in files with read_tsv

 ## 1
 ## found matching linkedTxome:
 ## [ LocalEnsembl - Drosophila melanogaster - release 98 ]
 ## building TxDb with 'txdbmaker' package
 ## Import genomic features from the file as a GRanges object... OK
 ## Prepare the 'metadata' data frame... OK
 ## Make the TxDb object...

 ## Warning in.makeTxDb_normarg_chrominfo(chrominfo): genome version information
 ## is not available for this TxDb object

 ## OK
 ## generating transcript ranges

 ## Warning in checkAssays2Txps(assays, txps):
 ## Warning: the annotation is missing some transcripts that were quantified.
 ## 5 out of 33706 txps were missing from GTF/GFF but were in the indexed FASTA
 ## (e.g. this can occur with transcripts located on haplotype chromosomes).
 ## In order to build a ranged SummarizedExperiment, these txps were removed.
 ## To keep these txps, and to skip adding ranges, use skipMeta=TRUE
 ## Example missing txps: [FBtr0307759, FBtr0084079, FBtr0084080,...]

This warning, "*Warning: the annotation is missing some transcripts that were quantified.*", is
common and occurs when annotation sources provide transcripts in the FASTA file that aren't
annotated in the GTF file. This is upstream of `tximeta()`, but this package will notify you the
number of transcripts for which this is the case.

# How does it work?

`tximeta()` recognized the computed *digest* of the transcriptome that the files were quantified
against, it accessed the GTF file of the transcriptome source, found and attached the transcript
ranges, and added the appropriate transcriptome and genome metadata. A *digest* is a small string of
alphanumeric characters that uniquely identifies the collection of sequences that were used for
quantification (it is the hash value from applying the hash function to a particular collection of
nucleotide sequences). We sometimes also call this value a "checksum" (in the tximeta paper), and we
sometimes call the table of pre-computed digests or linked digests a "hash table".

Note that a remote GTF is only downloaded once, and a local or remote GTF is only parsed to build a
*TxDb* or *EnsDb* once: if `tximeta()` recognizes that it has seen this *salmon* index before, it
will use a cached version of the metadata and transcript ranges.

# Packages used for caching metadata

`tximeta()` makes use of Bioconductor packages for storing transcript databases as *TxDb* or *EnsDb*
objects, which both are connected by default to `sqlite` backends. For GENCODE and RefSeq GTF files,
`tximeta()` uses the *txdbmaker* package to parse the GTF and build a *TxDb*. For Ensembl GTF files,
`tximeta()` will first attempt to obtain the correct *EnsDb* object using *AnnotationHub*. The
*ensembldb* package contains classes and methods for extracting relevant data from Ensembl files. If
the *EnsDb* has already been made available on AnnotationHub, `tximeta()` will download the database
directly, which saves the user time parsing the GTF into a database (to avoid this, set
`useHub=FALSE`). If the relevant *EnsDb* is not available on AnnotationHub, `tximeta()` will build
an *EnsDb* using *ensembldb* after downloading the GTF file. Again, the download/construction of a
transcript database occurs only once, and upon subsequent usage of *tximeta* functions, the cached
version will be used.

# Pre-computed digests

The following digests for human, mouse, and drosophila reference transcripts are supported in this
version of `tximeta()`:

 source organism releases
 GENCODE Homo sapiens 23-49
 GENCODE Mus musculus M6-M38
 Ensembl Homo sapiens 76-115
 Ensembl Mus musculus 76-115
 Ensembl Drosophila melanogaster 79-115
 RefSeq Homo sapiens p1-p13
 RefSeq Mus musculus p2-p6

For Ensembl transcriptomes, we support the combined protein coding (cDNA) and non-coding (ncRNA)
sequences, as well as the protein coding alone (although the former approach combining coding and
non-coding transcripts is recommended for more accurate quantification).

`tximeta()` also supports *linked transcriptomes*, a mechanism to link quantification data to key
metadata. This can be used to resolve many potential situations where one of the above pre-computed
digests won't be a match (due to modifying, re-ordering, adding, or removing transcripts, which
changes the value of the compute digest). See the [Linked transcriptomes](#linked-transcriptomes)
section below for a demonstration. (The *makeLinkedTxome* function was used above to avoid
downloading the GTF during the vignette building process.)

For *oarfish* quantification using the `--annotated` and `--novel` reference transcripts, use the
functions described [below](#mixed-reference-transcripts).

# SummarizedExperiment output

The `SummarizedExperiment` object resulting from the data import contains our coldata from before.
Note that the `files` column was removed during the import.

```
suppressPackageStartupMessages(library(SummarizedExperiment))
colData(se)
```

 ## DataFrame with 1 row and 2 columns
 ## names condition
 ## <character> <character>
 ## SRR1197474 SRR1197474 A

Here we show the three matrices that were imported.

```
assayNames(se)
```

 ## "counts" "abundance" "length"

If there were inferential replicates (Gibbs samples or bootstrap samples), these would be imported
as additional assays named `"infRep1"`, `"infRep2"`,...

`tximeta()` has imported the correct ranges for the transcripts:

```
rowRanges(se)
```

 ## GRanges object with 33701 ranges and 3 metadata columns:
 ## seqnames ranges strand | tx_id gene_id
 ## <Rle> <IRanges> <Rle> | <integer> <CharacterList>
 ## FBtr0070129 X 656673-657899 + | 28756 FBgn0025637
 ## FBtr0070126 X 656356-657899 + | 28752 FBgn0025637
 ## FBtr0070128 X 656673-657899 + | 28755 FBgn0025637
 ## FBtr0070124 X 656114-657899 + | 28750 FBgn0025637
 ## FBtr0070127 X 656356-657899 + | 28753 FBgn0025637
 ## FBtr0114299 2R 21325218-21325323 + | 9300 FBgn0086023
 ## FBtr0113582 3R 5598638-5598777 - | 24474 FBgn0082989
 ## FBtr0091635 3L 1488906-1489045 + | 13780 FBgn0086670
 ## FBtr0113599 3L 261803-261953 - | 16973 FBgn0083014
 ## FBtr0113600 3L 831870-832008 - | 17070 FBgn0083057
 ## tx_name
 ## <character>
 ## FBtr0070129 FBtr0070129
 ## FBtr0070126 FBtr0070126
 ## FBtr0070128 FBtr0070128
 ## FBtr0070124 FBtr0070124
 ## FBtr0070127 FBtr0070127
 ## … output truncated; full runtime metadata is intentionally omitted …
 ## FBtr0113599 FBtr0113599
 ## FBtr0113600 FBtr0113600
 ## seqinfo: 25 sequences from an unspecified genome; no seqlengths

We have appropriate genome information, which prevents us from making bioinformatic mistakes:

```
seqinfo(se)
```

 ## Seqinfo object with 25 sequences from an unspecified genome; no seqlengths:
 ## seqnames seqlengths isCircular genome
 ## 2L <NA> <NA> <NA>
 ## 2R <NA> <NA> <NA>
 ## 3L <NA> <NA> <NA>
 ## 3R <NA> <NA> <NA>
 ## 4 <NA> <NA> <NA>
 ## 211000022280481 <NA> <NA> <NA>
 ## 211000022280494 <NA> <NA> <NA>
 ## 211000022280703 <NA> <NA> <NA>
 ## mitochondrion_genome <NA> <NA> <NA>
 ## rDNA <NA> <NA> <NA>

# Retrieve the transcript database

The `se` object has associated metadata that allows `tximeta` to link to locally stored cached
databases and other Bioconductor objects. In further sections, we will show examples of functions
that leverage these databases to add exon information, summarize transcript-level data to the gene
level, or add identifiers. However, first we mention that the user can easily access the cached
database with the following helper function. In this case, `tximeta` has an associated *EnsDb*
object that we can retrieve and use in our R session:

```
edb <- retrieveDb(se)
```

 ## loading existing TxDb created: 2026-02-06 01:44:06

```
class(edb)
```

 ## "TxDb"
 ## attr(,"package")
 ## "GenomicFeatures"

The database returned by `retrieveDb` is either a *TxDb* in the case of GENCODE or RefSeq GTF
annotation file, or an *EnsDb* in the case of an Ensembl GTF annotation file. For further use of
these two database objects, consult the *GenomicFeatures* vignettes and the *ensembldb* vignettes,
respectively (both Bioconductor packages).

# Add exons per transcript

Because the SummarizedExperiment maintains all the metadata of its creation, it also keeps a pointer
to the necessary database for pulling out additional information, as demonstrated in the following
sections.

If necessary, the *tximeta* package can pull down the remote source to build a TxDb, but given that
we've already built a TxDb once, it simply loads the cached version. In order to remove the cached
TxDb and regenerate, one can remove the relevant entry from the `tximeta` file cache that resides at
the location given by `getTximetaBFC()`.

The `se` object created by `tximeta`, has the start, end, and strand information for each
transcript. Here, we swap out the transcript *GRanges* for exons-by-transcript *GRangesList* (it is
a list of *GRanges*, where each element of the list gives the exons for a particular transcript).

```
se.exons <- addExons(se)
```

 ## loading existing TxDb created: 2026-02-06 01:44:06

 ## generating exon ranges

```
rowRanges(se.exons)[[1]]
```

 ## GRanges object with 2 ranges and 3 metadata columns:
 ## seqnames ranges strand | exon_id exon_name exon_rank
 ## <Rle> <IRanges> <Rle> | <integer> <character> <integer>
 ## X 656673-656740 + | 72949 FBtr0070129-E1 1
 ## X 657099-657899 + | 72952 FBtr0070129-E2 2
 ## seqinfo: 25 sequences from an unspecified genome; no seqlengths

As with the transcript ranges, the exon ranges will be generated once and cached locally. As it
takes a non-negligible amount of time to generate the exon-by-transcript *GRangesList*, this local
caching offers substantial time savings for repeated usage of `addExons` with the same
transcriptome.

We have implemented `addExons` to work only on the transcript-level *SummarizedExperiment* object.
We provide some motivation for this choice in `?addExons`. Briefly, if it is desired to know the
exons associated with a particular gene, we feel that it makes more sense to pull out the relevant
set of exons-by-transcript for the transcripts for this gene, rather than losing the hierarchical
structure (exons to transcripts to genes) that would occur with a *GRangesList* of exons grouped per
gene.

# Easy summarization to gene-level

Likewise, the *tximeta* package can make use of the cached TxDb database for the purpose of
summarizing transcript-level quantifications and bias corrections to the gene-level. After
summarization, the `rowRanges` reflect the start and end position of the gene, which in Bioconductor
are defined by the leftmost and rightmost genomic coordinates of all the transcripts. As with the
transcript and exons, the gene ranges are cached locally for repeated usage. The transcript IDs are
stored as a *CharacterList* column `tx_ids`.

**Note:** you can also use `summarizeToGene` on an object created with `skipMeta=TRUE` which
therefore does not have ranges or an associated *TxDb* by setting `skipRanges=TRUE` and providing
your own `tx2gene` table which is passed to `tximport`.

```
gse <- summarizeToGene(se)
```

 ## loading existing TxDb created: 2026-02-06 01:44:06

 ## obtaining transcript-to-gene mapping from database

 ## generating gene ranges

 ## assignRanges='range': gene ranges assigned by total range of isoforms
 ## see details at:?summarizeToGene,SummarizedExperiment-method

 ## summarizing abundance

 ## summarizing counts

 ## summarizing length

```
rowRanges(gse)
```

 ## GRanges object with 17208 ranges and 2 metadata columns:
 ## seqnames ranges strand | gene_id
 ## <Rle> <IRanges> <Rle> | <character>
 ## FBgn0000003 3R 6822498-6822796 + | FBgn0000003
 ## FBgn0000008 2R 22136968-22172834 + | FBgn0000008
 ## FBgn0000014 3R 16807214-16830049 - | FBgn0000014
 ## FBgn0000015 3R 16927212-16972236 - | FBgn0000015
 ## FBgn0000017 3L 16615866-16647882 - | FBgn0000017
 ## FBgn0286199 3R 24279572-24281576 + | FBgn0286199
 ## FBgn0286203 2R 5413744-5456095 + | FBgn0286203
 ## FBgn0286204 3R 8950246-8963037 - | FBgn0286204
 ## FBgn0286213 3L 13023352-13024762 + | FBgn0286213
 ## FBgn0286222 X 6678424-6681845 + | FBgn0286222
 ## tx_ids
 ## <CharacterList>
 ## FBgn0000003 FBtr0081624
 ## FBgn0000008 FBtr0071763,FBtr0100521,FBtr0342981,...
 ## FBgn0000014 FBtr0306337,FBtr0083388,FBtr0083387,...
 ## FBgn0000015 FBtr0415463,FBtr0415464,FBtr0083385,...
 ## FBgn0000017 FBtr0112790,FBtr0345369,FBtr0075357,...
 ## … output truncated; full runtime metadata is intentionally omitted …
 ## FBgn0286213 FBtr0075878
 ## FBgn0286222 FBtr0070953,FBtr0070954
 ## seqinfo: 25 sequences from an unspecified genome; no seqlengths

## Assign ranges by abundance

We also offer a new type of range assignment, based on the most abundant isoform rather than the
leftmost to rightmost coordinate. See the `assignRanges` argument of `?summarizeToGene`. Using the
most abundant isoform arguably will reflect more accurate genomic distances than the default option.

```
# unevaluated code chunk
gse <- summarizeToGene(se, assignRanges="abundant")
```

For more explanation about why this may be a better choice, see the following tutorial chapter:

<https://tidyomics.github.io/tidy-ranges-tutorial/gene-ranges-in-tximeta.html>

In the below diagram, the pink feature is the set of all exons belonging to any isoform of the gene,
such that the TSS is on the right side of this minus strand feature. However, the blue feature is
the most abundant isoform (the brown features are the next most abundant isoforms). The pink feature
is therefore not a good representation for the locus.

# Add different identifiers

We would like to add support to easily map transcript or gene identifiers from one annotation to
another. This is just a prototype function, but we show how we can easily add alternate IDs given
that we know the organism and the source of the transcriptome. (This function currently only works
for GENCODE and Ensembl gene or transcript IDs but could be extended to work for arbitrary sources.)

```
library(org.Dm.eg.db)
gse <- addIds(gse, "REFSEQ", gene=TRUE)
```

 ## mapping to new IDs using org.Dm.eg.db
 ## if all matching IDs are desired, and '1:many mappings' are reported,
 ## set multiVals='list' to obtain all the matching IDs

 ## 'select()' returned 1:many mapping between keys and columns

```
mcols(gse)
```

 ## DataFrame with 17208 rows and 3 columns
 ## gene_id tx_ids REFSEQ
 ## <character> <CharacterList> <character>
 ## FBgn0000003 FBgn0000003 FBtr0081624 NR_001992
 ## FBgn0000008 FBgn0000008 FBtr0071763,FBtr0100521,FBtr0342981,... NM_001014543
 ## FBgn0000014 FBgn0000014 FBtr0306337,FBtr0083388,FBtr0083387,... NM_001170161
 ## FBgn0000015 FBgn0000015 FBtr0415463,FBtr0415464,FBtr0083385,... NM_001275719
 ## FBgn0000017 FBgn0000017 FBtr0112790,FBtr0345369,FBtr0075357,... NM_001104153
 ## FBgn0286199 FBgn0286199 FBtr0084600 NM_142982
 ## FBgn0286203 FBgn0286203 FBtr0299918,FBtr0299920,FBtr0299921,... NM_001144134
 ## FBgn0286204 FBgn0286204 FBtr0082014,FBtr0334329 NM_001275464
 ## FBgn0286213 FBgn0286213 FBtr0075878 NM_168534
 ## FBgn0286222 FBgn0286222 FBtr0070953,FBtr0070954 NM_132111

# Differential expression analysis

The following code chunk demonstrates how to build a *DESeqDataSet* and begin a differential
expression analysis.

```
suppressPackageStartupMessages(library(DESeq2))
# here there is a single sample so we use ~1.
# expect a warning that there is only a single sample...
suppressWarnings({dds <- DESeqDataSet(gse, ~1)})
```

 ## using counts and average transcript lengths from tximeta

```
# ... see DESeq2 vignette
```

The *Swish* method in the *fishpond* package directly works with the *SummarizedExperiment* output
from *tximeta*, and can perform differential analysis on transcript expression taking into account
inferential replicates, e.g. bootstrap or Gibbs samples, which are imported and arranged by
`tximeta` if these were generated during quantification.

```
# un-evaluated code
library(fishpond)
y <- se
y <- scaleInfReps(y)
y <- labelKeep(y)
y <- swish(y, x="condition")
# ... see Swish vignette in fishpond package
```

We have a convenient wrapper function that will build a *DGEList* object for use with *edgeR*.

```
suppressPackageStartupMessages(library(edgeR))
y <- makeDGEList(gse)
# ... see edgeR User's Guide for further steps
```

The following code chunk demonstrates the code inside of the above wrapper function, and produces
the same output.

```
cts <- assays(gse)[["counts"]]
normMat <- assays(gse)[["length"]]
normMat <- normMat / exp(rowMeans(log(normMat)))
o <- log(calcNormFactors(cts/normMat)) + log(colSums(cts/normMat))
y <- DGEList(cts)
y <- scaleOffset(y, t(t(log(normMat)) + o))
# ... see edgeR User's Guide for further steps
```

For *limma* with *voom* transformation we recommend, as in the *tximport* vignette, to generate
counts-from-abundance instead of providing an offset for average transcript length.

```
gse <- summarizeToGene(se, countsFromAbundance="lengthScaledTPM")
```

 ## loading existing TxDb created: 2026-02-06 01:44:06

 ## obtaining transcript-to-gene mapping from database

 ## loading existing gene ranges created: 2026-02-06 01:44:11

 ## assignRanges='range': gene ranges assigned by total range of isoforms
 ## see details at:?summarizeToGene,SummarizedExperiment-method

 ## summarizing abundance

 ## summarizing counts

 ## summarizing length

```
library(limma)
y <- DGEList(assays(gse)[["counts"]])
# see limma User's Guide for further steps
```

Above we generated counts-from-abundance when calling `summarizeToGene`. The counts-from-abundance
status is then stored in the metadata:

```
metadata(gse)$countsFromAbundance
```

 ## "lengthScaledTPM"

# Additional metadata slots

The following information is attached to the *SummarizedExperiment* by `tximeta`:

```
names(metadata(se))
```

 ## "tximetaInfo" "quantInfo" "countsFromAbundance"
 ## "level" "txomeInfo" "txdbInfo"

```
str(metadata(se)[["quantInfo"]])
```

 ## List of 31
 ## $ salmon_version: chr "0.14.1"
 ## $ samp_type: chr "none"
 ## $ opt_type: chr "vb"
 ## $ quant_errors:List of 1
 ##..$: list()
 ## $ num_libraries: int 1
 ## $ library_types: chr "ISR"
 ## $ frag_dist_length: int 1001
 ## $ seq_bias_correct: logi FALSE
 ## $ gc_bias_correct: logi TRUE
 ## $ num_bias_bins: int 4096
 ## $ mapping_type: chr "mapping"
 ## $ num_valid_targets: int 33706
 ## $ num_decoy_targets: int 0
 ## $ num_eq_classes: int 70718
 ## $ serialized_eq_classes: logi FALSE
 ## $ length_classes: int [1:5, 1] 867 1533 2379 3854 71382
 ## $ index_seq_hash: chr "7ba5e9597796ea86cf11ccf6635ca88fbc37c2848d38083c23986aa2c6a21eae"
 ## $ index_name_hash: chr "b6426061057bba9b7afb4dc76fa68238414cf35b4190c95ca6fc44280d4ca87c"
 ## $ index_seq_hash512: chr "05f111abcda1efd2e489ace6324128cdaaa311712a28ed716d957fdfd8706ec41ca9177ebf12f54e99c2a89582d06f31c5e09dc1dce2d13"| __truncated__
 ## $ index_name_hash512: chr "ccdf58f23e48c8c53cd122b5f5990b5adce9fec87ddf8bd88153afbe93296d87b818fba89d12dbc20c882f7d98353840394c5040fea7432"| __truncated__
 ## $ num_bootstraps: int 0
 ## $ num_processed: int 42422337
 ## $ num_mapped: int 34098209
 ## $ num_decoy_fragments: int 0
 ## … output truncated; full runtime metadata is intentionally omitted …
 ## $ call: chr "quant"
 ## $ start_time: chr "Sat Oct 12 13:55:01 2019"
 ## $ end_time: chr "Sat Oct 12 14:08:11 2019"

```
str(metadata(se)[["txomeInfo"]])
```

 ## List of 10
 ## $ index: chr "Dm.BDGP6.22.98_salmon-0.14.1"
 ## $ source: chr "LocalEnsembl"
 ## $ organism: chr "Drosophila melanogaster"
 ## $ release: chr "98"
 ## $ genome: chr "BDGP6.22"
 ## $ fasta:List of 1
 ##..$: chr [1:2] "ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/cdna/Drosophila_melanogaster.BDGP6.22.cdna.all.fa.gz" "ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/ncrna/Drosophila_melanogaster.BDGP6.22.ncrna.fa.gz"
 ## $ gtf: chr "/home/biocbuild/bbs-3.22-bioc/R/site-library/tximportData/extdata/salmon_dm/Drosophila_melanogaster.BDGP6.22.98.gtf.gz"
 ## $ sha256: chr "7ba5e9597796ea86cf11ccf6635ca88fbc37c2848d38083c23986aa2c6a21eae"
 ## $ linkedTxome: Named logi TRUE
 ##..- attr(*, "names")= chr "txome"
 ## $ linkedTxpData: Named logi FALSE
 ##..- attr(*, "names")= chr "txome"

```
str(metadata(se)[["tximetaInfo"]])
```

 ## List of 3
 ## $ version:Classes 'package_version', 'numeric_version' hidden list of 1
 ##..$: int [1:3] 1 28 3
 ## $ type: chr "salmon"
 ## $ importTime: POSIXct[1:1], format: "2026-02-05 20:43:54"

```
str(metadata(se)[["txdbInfo"]])
```

 ## Named chr [1:12] "TxDb" "GenomicFeatures"...
 ## - attr(*, "names")= chr [1:12] "Db type" "Supporting package" "Data source" "Organism"...

# Mixed reference transcripts

The [oarfish](https://github.com/COMBINE-lab/oarfish) quantification tools allows specifying
distinct *annotated* reference transcripts (e.g. GENCODE, Ensembl) and *novel* reference transcripts
(e.g. *de novo* assemblies) which are combined together as the index for alignment and
quantification.

Here we introduce a new workflow for importing data and linking data to metadata, designed for this
mixed reference transcript situation, but which may be generalized in the future for other
transcript quantification settings.

- `importData()` - imports data as an un-ranged *SummarizedExperiment*
- `inspectDigests()` - inspects the digest status of the indices for imported data
- `updateMetadata()` - assists in attaching metadata from matching reference transcriptomes
- and *linkedTxpData*, a lightweight version of *linkedTxome*, described
 [below](#linked-transcriptomes)

```
# specify 3 oarfish .quant files, quantified against an index of two .fa files:
# `--annotated gencode.v48.transcripts.fa.gz --novel novel.fa.gz`
dir <- system.file("extdata/oarfish", package="tximportData")
names <- paste0("rep", 2:4)
files <- file.path(dir, paste0("sgnex_h9_", names, ".quant.gz"))
coldata <- data.frame(files, names)
# read in the quantification data
se <- importData(coldata, type="oarfish")
```

 ## reading in files with read_tsv

 ## 1 2 3
 ## returning un-ranged SummarizedExperiment, see functions:
 ## -- inspectDigests() to check matching digests
 ## -- makeLinkedTxome/makeLinkedTxpData() to link digests to metadata
 ## -- updateMetadata() to update metadata and optionally add ranges

The `importData()` function returns an un-ranged SummarizedExperiment, with no metadata attached.
This is similar to what `tximeta()` does with `skipMeta=TRUE`.

```
class(se)
```

 ## "SummarizedExperiment"
 ## attr(,"package")
 ## "SummarizedExperiment"

```
rowData(se)
```

 ## DataFrame with 423044 rows and 0 columns

We can now inspect the digests of the two indices:

```
# returns a 2-row tibble
# (here localGENCODE avoids downloading an ftp file)
inspectDigests(se)
```

 ## # A tibble: 2 × 8
 ## index source organism release genome linkedTxome linkedTxpData small_digest
 ## <chr> <chr> <chr> <chr> <chr> <lgl> <lgl> <chr>
 ## 1 annotat… Local… Homo sa… 48 GRCh38 TRUE FALSE 6fc626
 ## 2 novel <NA> <NA> <NA> <NA> NA NA 43158f

We can see the `source` and other annotation details for `annotated` and for `novel`. If a match is
found in the pre-computed digests, the [linkedTxome](#linked-transcriptomes) digests, or the
`linkedTxpData` digests, it will populate the `source` to `genome` columns and will indicate if it
is a `linkedTxome` or `linkedTxpData` match.

**Note**: `linkedTxpData` is a newly developed, lightweight version of `linkedTxome`, which links
quantification data to metadata in the form of a *GRanges* object for a set of transcripts. For more
details see the man page for `makeLinkedTxpData()`.

If both `linkedTxome` and `linkedTxpData` are `FALSE` and the metadata is populated, the digest was
a match among the [pre-computed digests](#pre-computed-digests).

A small 6-character version of the digest is printed. One can also obtain the full digest (shown
below).

```
inspectDigests(se, fullDigest=TRUE)
```

 ## # A tibble: 2 × 9
 ## index source organism release genome linkedTxome linkedTxpData small_digest
 ## <chr> <chr> <chr> <chr> <chr> <lgl> <lgl> <chr>
 ## 1 annotat… Local… Homo sa… 48 GRCh38 TRUE FALSE 6fc626
 ## 2 novel <NA> <NA> <NA> <NA> NA NA 43158f
 ## # ℹ 1 more variable: digest <chr>

One can also obtain the count (`count=TRUE`) of matching transcripts per index, which involves
loading transcript data from locally cached sources (or generating these from local or remote GTF as
needed).

Inspection can be run iteratively, in combination with `makeLinkedTxome()` described
[below](#linked-transcriptomes) or `makeLinkedTxpData()`, in order to match up missing digests with
GTF files and/or range-based metadata.

The next step is to run `updateMetadata()`. This function does what `tximeta()` does by default for
a single index, by adding available metadata and attaching to `rowData`. Thus `updateMetadata()`
overlaps with previous behavior by `addIds()`. Some options here are to add `ranges=TRUE` which
populates `rowRanges` but necessitates removing transcripts (rows) without range information. Here,
transcripts are preserved but `NA` filled in for columns where we don't have metadata.

```
se_update <- updateMetadata(se)
```

 ## Warning in.get_cds_IDX(mcols0$type, mcols0$phase): The "phase" metadata column contains non-NA values for features of type
 ## stop_codon. This information was ignored.

 ## Warning in.makeTxDb_normarg_chrominfo(chrominfo): genome version information
 ## is not available for this TxDb object

 ## --annotated: adding metadata for 385669 transcripts

 ## --novel: no transcript metadata found
 ## consider using `linkedTxome`, or `linkedTxpData` (see man pages)

 ## --novel: no matching transcripts

```
mcols(se_update)
```

 ## DataFrame with 423044 rows and 4 columns
 ## tx_name tx_id gene_id index
 ## <character> <integer> <CharacterList> <character>
 ## ENST00000832824.1 ENST00000832824.1 1 ENSG00000290825.2 annotated
 ## ENST00000832825.1 ENST00000832825.1 2 ENSG00000290825.2 annotated
 ## ENST00000832826.1 ENST00000832826.1 3 ENSG00000290825.2 annotated
 ## ENST00000832827.1 ENST00000832827.1 4 ENSG00000290825.2 annotated
 ## ENST00000832828.1 ENST00000832828.1 5 ENSG00000290825.2 annotated
 ## novel10996 novel10996 NA NA NA
 ## novel10997 novel10997 NA NA NA
 ## novel10998 novel10998 NA NA NA
 ## novel10999 novel10999 NA NA NA
 ## novel11000 novel11000 NA NA NA

`updateMetadata()` also allows adding metadata manually, either in the form of a *GRanges* object or
*data.frame*-like object. Note that `makeLinkedTxpData()` can be used for persistent addition of
*GRanges* metadata across sessions.

```
# define novel set so we can add metadata
novel <- data.frame(
  seqnames = paste0("chr", rep(1:22, each = 500)),
  start = 1e6 + 1 + 0:499 * 1000,
  end = 1e6 + 1 + 0:499 * 1000 + 1000 - 1,
  strand = "+",
  tx_name = paste0("novel", 1:(22 * 500)),
  gene_id = paste0("novel_gene", rep(1:(22 * 10), each = 50)),
  type = "protein_coding"
)
head(novel)
```

 ## seqnames start end strand tx_name gene_id type
 ## 1 chr1 1000001 1001000 + novel1 novel_gene1 protein_coding
 ## 2 chr1 1001001 1002000 + novel2 novel_gene1 protein_coding
 ## 3 chr1 1002001 1003000 + novel3 novel_gene1 protein_coding
 ## 4 chr1 1003001 1004000 + novel4 novel_gene1 protein_coding
 ## 5 chr1 1004001 1005000 + novel5 novel_gene1 protein_coding
 ## 6 chr1 1005001 1006000 + novel6 novel_gene1 protein_coding

```
library(GenomicRanges)
novel_gr <- as(novel, "GRanges")
names(novel_gr) <- novel$tx_name
```

Metadata specified via the `txpData` argument will be added to transcript labelled with
`index="user"`.

```
se_with_ranges <- updateMetadata(se, txpData=novel_gr, ranges=TRUE)
```

 ## --annotated: adding metadata for 385669 transcripts

 ## --novel: no transcript metadata found
 ## consider using `linkedTxome`, or `linkedTxpData` (see man pages)

 ## --novel: no matching transcripts

 ## --user: adding metadata for 11000 transcripts

 ## building RangedSE: subsetting to 396669 out of 423044 rows with range data

```
rowRanges(se_with_ranges)
```

 ## GRanges object with 396669 ranges and 5 metadata columns:
 ## seqnames ranges strand | tx_name
 ## <Rle> <IRanges> <Rle> | <character>
 ## ENST00000832824.1 chr1 11121-14413 + | ENST00000832824.1
 ## ENST00000832825.1 chr1 11125-14405 + | ENST00000832825.1
 ## ENST00000832826.1 chr1 11410-14413 + | ENST00000832826.1
 ## ENST00000832827.1 chr1 11411-14413 + | ENST00000832827.1
 ## ENST00000832828.1 chr1 11426-14409 + | ENST00000832828.1
 ## novel10996 chr22 1495001-1496000 + | novel10996
 ## novel10997 chr22 1496001-1497000 + | novel10997
 ## novel10998 chr22 1497001-1498000 + | novel10998
 ## novel10999 chr22 1498001-1499000 + | novel10999
 ## novel11000 chr22 1499001-1500000 + | novel11000
 ## tx_id gene_id index type
 ## <integer> <CharacterList> <character> <character>
 ## ENST00000832824.1 1 ENSG00000290825.2 annotated NA
 ## ENST00000832825.1 2 ENSG00000290825.2 annotated NA
 ## ENST00000832826.1 3 ENSG00000290825.2 annotated NA
 ## ENST00000832827.1 4 ENSG00000290825.2 annotated NA
 ## ENST00000832828.1 5 ENSG00000290825.2 annotated NA
 ## … output truncated; full runtime metadata is intentionally omitted …
 ## novel10999 <NA> novel_gene220 user protein_coding
 ## novel11000 <NA> novel_gene220 user protein_coding
 ## seqinfo: 25 sequences (1 circular) from an unspecified genome; no seqlengths

Two additional details for `inspectDigests()` and `updateMetadata()`:

1. The argument `prefer` specifies the preferred order of digest match across various *tximeta*
 registries. Default is `txome`: linkedTxome, then `txpdata`: linkedTxpData, finally
 `precomputed`.
2. One can specify per index, the `key`, *i.e.* the name of the column used for matching metadata.
 By default `tx_name` is used.

This new workflow for data import is under active development, feel free to post an
[Issue](https://github.com/thelovelab/tximeta/issues/new) with any feedback.

# Errors connecting to a database

`tximeta` makes use of *BiocFileCache* to store transcript and other databases, so saving the
relevant databases in a centralized location used by other Bioconductor packages as well. It is
possible that an error can occur in connecting to these databases, either if the files were
accidentally removed from the file system, or if there was an error generating or writing the
database to the cache location. In each of these cases, it is easy to remove the entry in the
*BiocFileCache* so that `tximeta` will know to regenerate the transcript database or any other
missing database.

If you have used the default cache location, then you can obtain access to your BiocFileCache with:

```
library(BiocFileCache)
```

 ## Loading required package: dbplyr

```
bfc <- BiocFileCache()
```

Otherwise, you can recall your particular `tximeta` cache location with `getTximetaBFC()`.

You can then inspect the entries in your BiocFileCache using `bfcinfo` and remove the entry
associated with the missing database with `bfcremove`. See the BiocFileCache vignette for more
details on finding and removing entries from a BiocFileCache.

Note that there may be many entries in the BiocFileCache location, including `.sqlite` database
files and serialized `.rds` files. You should only remove the entry associated with the missing
database, e.g. if R gave an error when trying to connect to the TxDb associated with GENCODE v99
human transcripts, you should look for the `rid` of the entry associated with the human v99 GTF from
GENCODE.

# What if digest isn't known?

`tximeta` automatically imports relevant metadata when the transcriptome matches a known source --
*known* in the sense that it is in the set of pre-computed digests in `tximeta` (GENCODE, Ensembl,
and RefSeq for human and mouse). `tximeta` also facilitates the linking of transcriptomes used in
building the *salmon* index with relevant public sources, in the case that these are not part of
this pre-computed set known to `tximeta`. The linking of the transcriptome source with the
quantification files is important in the case that the transcript sequence no longer matches a known
source (uniquely combined or filtered FASTA files), or if the source is not known to `tximeta`.
Combinations of coding and non-coding human, mouse, and fruit fly *Ensembl* transcripts should be
automatically recognized by `tximeta` and does not require making a *linkedTxome*. As the package is
further developed, we plan to roll out support for all common transcriptomes, from all sources.

**Note:** if you are using *salmon* in alignment mode, then there is no salmon index, and without
the salmon index, there is no digest. We don't have a perfect solution for this yet, but you can
still summarize transcript counts to gene with a `tx2gene` table that you construct manually (see
`tximport` vignette for example code). Just specify the arguments, `skipMeta=TRUE, txOut=FALSE,
tx2gene=tx2gene`, when calling `tximeta` and it will perform summarization to gene level as in
`tximport`.

We now demonstrate how to make a *linkedTxome* and how to share and load a *linkedTxome*. We point
to a *salmon* quantification file which was quantified against a transcriptome that included the
coding and non-coding *Drosophila melanogaster* transcripts, as well as an artificial transcript of
960 bp (for demonstration purposes only).

```
dir <- system.file("extdata/salmon_dm", package="tximportData")
file <- file.path(dir, "SRR1197474.plus", "quant.sf")
file.exists(file)
```

 ## TRUE

```
coldata <- data.frame(files=file, names="SRR1197474", sample="1",
                      stringsAsFactors=FALSE)
```

Trying to import the files gives a message that `tximeta` couldn't find a matching transcriptome, so
it returns an non-ranged *SummarizedExperiment*.

```
se <- tximeta(coldata)
```

 ## importing salmon quantification files

 ## reading in files with read_tsv

 ## 1
 ## couldn't find matching transcriptome, returning non-ranged SummarizedExperiment

# Linked transcriptomes

If the transcriptome used to generate the *salmon* index does not match any transcriptomes from
known sources (e.g. from combining or filtering known transcriptome files), there is not much that
can be done to automatically populate the metadata during quantification import. However, we can
facilitate the following two cases:

1. the transcriptome was created locally and has been linked to its public source(s)
2. the transcriptome was produced by another group, and they have produced and shared a file that
 links the transcriptome to public source(s)

`tximeta` offers functionality to assist reproducible analysis in both of these cases.

To make this quantification reproducible, we make a `linkedTxome` which records key information
about the sources of the transcript FASTA files, and the location of the relevant GTF file. It also
records the digest of the transcriptome that was computed by *salmon* during the `index` step.

**Source:** when creating the `linkedTxome` one must specify the `source` of the transcriptome. See
`?linkedTxome` for a note on the implications of this text string. For canonical GENCODE or Ensembl
transcriptomes, one can use `"GENCODE"` or `"Ensembl"`, but for modified or otherwise any
transcriptomes defined by a local database, it is recommended to use a different string,
`"LocalGENCODE"` or \`"LocalEnsembl", which will avoid *tximeta* pulling canonical GENCODE or
Ensembl resources from AnnotationHub.

**Multiple GTF/GFF files:** `linkedTxome` and `tximeta` do not currently support multiple GTF/GFF
files, which is a more complicated case than multiple FASTA, which is supported. Currently, we
recommend that users should add or combine GTF/GFF files themselves to create a single GTF/GFF file
that contains all features used in quantification, and then upload such a file to *Zenodo*, which
can then be linked as shown below. Feel free to contact the developers on the Bioconductor support
site or GitHub Issue page for further details or feature requests.

**Stringtie:** A special note for building on top of Stringtie-generated transcripts: it is a good
idea to change gene identifiers, to *not* include a period `.`, as the period will later be used to
separate transcript versions from gene identifiers. This can be done before building the salmon
index, by changing periods in the gene identifier to an underscore. See [this GitHub
issue](https://github.com/thelovelab/tximeta/issues/68) for details.

By default, `linkedTxome` will write out a JSON file which can be shared with others, linking the
digest of the index with the other metadata, including FASTA and GTF sources. By default, it will
write out to a file with the same name as the `indexDir`, but with a `.json` extension added. This
can be prevented with `write=FALSE`, and the file location can be changed with `jsonFile`.

First we specify the path where *salmon* index directory with `indexDir`, which will be used to look
up the digest and associate it with the index. Alternatively one can specify the `digest` itself and
an `indexName`.

Typically you would not use `system.file` and `file.path` to locate this directory, but simply
define `indexDir` to be the path of the *salmon* directory on your machine. Here we use
`system.file` and `file.path` because we have included parts of a *salmon* index directory in the
*tximeta* package itself for demonstration of functionality in this vignette.

```
indexDir <- file.path(dir, "Dm.BDGP6.22.98.plus_salmon-0.14.1")
```

Now we provide the location of the FASTA files and the GTF file for this transcriptome.

**Note:** the basename for the GTF file is used as a unique identifier for the cached versions of
the *TxDb* and the transcript ranges, which are stored on the user's behalf via *BiocFileCache*.
This is not an issue, as GENCODE, Ensembl, and RefSeq all provide GTF files which are uniquely
identified by their filename, e.g. `Drosophila_melanogaster.BDGP6.22.98.gtf.gz`.

The recommended usage of `tximeta` would be to specify a remote GTF source, as seen in the
commented-out line below:

```
fastaFTP <- c("ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/cdna/Drosophila_melanogaster.BDGP6.22.cdna.all.fa.gz",
              "ftp://ftp.ensembl.org/pub/release-98/fasta/drosophila_melanogaster/ncrna/Drosophila_melanogaster.BDGP6.22.ncrna.fa.gz",
              "extra_transcript.fa.gz")
#gtfFTP <- "ftp://path/to/custom/Drosophila_melanogaster.BDGP6.22.98.plus.gtf.gz"
```

Instead of the above commented-out FTP location for the GTF file, we specify a location within an R
package. This step is just to avoid downloading from a remote FTP during vignette building. This use
of `file.path` to point to a file in an R package is specific to this vignette and should not be
used in a typical workflow. The following GTF file is a modified version of the release 98 from
Ensembl, which includes description of a one transcript, one exon artificial gene which was inserted
into the transcriptome (for demonstration purposes only).

```
gtfPath <- file.path(dir,"Drosophila_melanogaster.BDGP6.22.98.plus.gtf.gz")
```

Finally, we create a *linkedTxome*. In this vignette, we point to a temporary directory for the JSON
file, but a more typical workflow would write the JSON file to the same location as the *salmon*
index by not specifying `jsonFile`.

`makeLinkedTxome` performs two operation: (1) it creates a new entry in an internal table that links
the transcriptome used in the *salmon* index to its sources, and (2) it creates a JSON file such
that this *linkedTxome* can be shared.

Here we can either specify `indexDir` or alternatively, the `digest` itself and an `indexName`.

```
tmp <- tempdir() # just for vignette demo, make temp directory
jsonFile <- file.path(tmp, paste0(basename(indexDir), ".json"))
makeLinkedTxome(indexDir=indexDir,
                source="LocalEnsembl", organism="Drosophila melanogaster",
                release="98", genome="BDGP6.22",
                fasta=fastaFTP, gtf=gtfPath,
                jsonFile=jsonFile)
```

 ## reading digest from indexDir: /home/biocbuild/bbs-3.22-bioc/R/site-library/tximportData/extdata/salmon_dm/Dm.BDGP6.22.98.plus_salmon-0.14.1

 ## writing linkedTxome to /tmp/RtmpmPgDLl/Dm.BDGP6.22.98.plus_salmon-0.14.1.json

 ## saving linkedTxome in bfc

After running `makeLinkedTxome`, the connection between this *salmon* index (and its digest) with
the sources is saved for persistent usage. Note that because we added a single transcript of 960bp
to the FASTA file used for quantification, `tximeta` could tell that this was not quantified against
release 98 of the Ensembl transcripts for *Drosophila melanogaster*. Only when the correct set of
transcripts were specified does `tximeta` recognize and import the correct metadata.

With use of `tximeta` and a *linkedTxome*, the software figures out if the remote GTF has been
accessed and compiled into a *TxDb* before, and on future calls, it will simply load the
pre-computed metadata and transcript ranges.

Note the warning that 5 of the transcripts are missing from the GTF file and so are dropped from the
final output. This is a problem coming from the annotation source, and not easily avoided by
`tximeta`.

```
se <- tximeta(coldata)
```

 ## importing salmon quantification files

 ## reading in files with read_tsv

 ## 1
 ## found matching linkedTxome:
 ## [ LocalEnsembl - Drosophila melanogaster - release 98 ]
 ## building TxDb with 'txdbmaker' package
 ## Import genomic features from the file as a GRanges object... OK
 ## Prepare the 'metadata' data frame... OK
 ## Make the TxDb object...

 ## Warning in.makeTxDb_normarg_chrominfo(chrominfo): genome version information
 ## is not available for this TxDb object

 ## OK
 ## generating transcript ranges

 ## Warning in checkAssays2Txps(assays, txps):
 ## Warning: the annotation is missing some transcripts that were quantified.
 ## 5 out of 33707 txps were missing from GTF/GFF but were in the indexed FASTA
 ## (e.g. this can occur with transcripts located on haplotype chromosomes).
 ## In order to build a ranged SummarizedExperiment, these txps were removed.
 ## To keep these txps, and to skip adding ranges, use skipMeta=TRUE
 ## Example missing txps: [FBtr0307759, FBtr0084079, FBtr0084080,...]

We can see that the appropriate metadata and transcript ranges are attached.

```
rowRanges(se)
```

 ## GRanges object with 33702 ranges and 3 metadata columns:
 ## seqnames ranges strand | tx_id gene_id
 ## <Rle> <IRanges> <Rle> | <integer> <CharacterList>
 ## Newgene 3R 1-960 + | 20219 Newgene
 ## FBtr0070129 X 656673-657899 + | 28757 FBgn0025637
 ## FBtr0070126 X 656356-657899 + | 28753 FBgn0025637
 ## FBtr0070128 X 656673-657899 + | 28756 FBgn0025637
 ## FBtr0070124 X 656114-657899 + | 28751 FBgn0025637
 ## FBtr0114299 2R 21325218-21325323 + | 9300 FBgn0086023
 ## FBtr0113582 3R 5598638-5598777 - | 24475 FBgn0082989
 ## FBtr0091635 3L 1488906-1489045 + | 13780 FBgn0086670
 ## FBtr0113599 3L 261803-261953 - | 16973 FBgn0083014
 ## FBtr0113600 3L 831870-832008 - | 17070 FBgn0083057
 ## tx_name
 ## <character>
 ## Newgene Newgene
 ## FBtr0070129 FBtr0070129
 ## FBtr0070126 FBtr0070126
 ## FBtr0070128 FBtr0070128
 ## FBtr0070124 FBtr0070124
 ## … output truncated; full runtime metadata is intentionally omitted …
 ## FBtr0113599 FBtr0113599
 ## FBtr0113600 FBtr0113600
 ## seqinfo: 25 sequences from an unspecified genome; no seqlengths

```
seqinfo(se)
```

 ## Seqinfo object with 25 sequences from an unspecified genome; no seqlengths:
 ## seqnames seqlengths isCircular genome
 ## 2L <NA> <NA> <NA>
 ## 2R <NA> <NA> <NA>
 ## 3L <NA> <NA> <NA>
 ## 3R <NA> <NA> <NA>
 ## 4 <NA> <NA> <NA>
 ## 211000022280481 <NA> <NA> <NA>
 ## 211000022280494 <NA> <NA> <NA>
 ## 211000022280703 <NA> <NA> <NA>
 ## mitochondrion_genome <NA> <NA> <NA>
 ## rDNA <NA> <NA> <NA>

# Clear *linkedTxomes*

The following code removes the entire table with information about the *linkedTxomes*. This is just
for demonstration, so that we can show how to load a JSON file below.

**Note:** Running this code will clear any information about *linkedTxomes*. Don't run this unless
you really want to clear this table!

```
library(BiocFileCache)
if (interactive()) {
  bfcloc <- getTximetaBFC()
} else {
  bfcloc <- tempdir()
}
bfc <- BiocFileCache(bfcloc)
bfcinfo(bfc)
```

 ## # A tibble: 9 × 10
 ## rid rname create_time access_time rpath rtype fpath last_modified_time etag
 ## <chr> <chr> <chr> <chr> <chr> <chr> <chr> <dbl> <chr>
 ## 1 BFC1 link… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 2 BFC2 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 3 BFC3 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 4 BFC4 exon… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 5 BFC5 gene… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 6 BFC6 genc… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 7 BFC7 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 8 BFC8 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 9 BFC9 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## # ℹ 1 more variable: expires <dbl>

```
# only run the next line if you want to remove your linkedTxome table!
bfcremove(bfc, bfcquery(bfc, "linkedTxomeTbl")$rid)
bfcinfo(bfc)
```

 ## # A tibble: 8 × 10
 ## rid rname create_time access_time rpath rtype fpath last_modified_time etag
 ## <chr> <chr> <chr> <chr> <chr> <chr> <chr> <dbl> <chr>
 ## 1 BFC2 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 2 BFC3 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 3 BFC4 exon… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 4 BFC5 gene… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 5 BFC6 genc… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 6 BFC7 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 7 BFC8 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 8 BFC9 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## # ℹ 1 more variable: expires <dbl>

# Loading *linkedTxome* JSON files

If a collaborator or the Suppmentary Files for a publication shares a `linkedTxome` JSON file, we
can likewise use `tximeta` to automatically assemble the relevant metadata and transcript ranges.
This implies that the other person has used `tximeta` with the function `makeLinkedTxome`
demonstrated above, pointing to their *salmon* index and to the FASTA and GTF source(s).

We point to the JSON file and use `loadLinkedTxome` and then the relevant metadata is saved for
persistent usage. In this case, we saved the JSON file in a temporary directory.

```
jsonFile <- file.path(tmp, paste0(basename(indexDir), ".json"))
loadLinkedTxome(jsonFile)
```

 ## saving linkedTxome in bfc (first time)

Again, using `tximeta` figures out whether it needs to access the remote GTF or not, and assembles
the appropriate object on the user's behalf.

```
se <- tximeta(coldata)
```

 ## importing salmon quantification files

 ## reading in files with read_tsv

 ## 1
 ## found matching linkedTxome:
 ## [ LocalEnsembl - Drosophila melanogaster - release 98 ]
 ## loading existing TxDb created: 2026-02-06 01:46:27
 ## loading existing transcript ranges created: 2026-02-06 01:46:27

 ## Warning in checkAssays2Txps(assays, txps):
 ## Warning: the annotation is missing some transcripts that were quantified.
 ## 5 out of 33707 txps were missing from GTF/GFF but were in the indexed FASTA
 ## (e.g. this can occur with transcripts located on haplotype chromosomes).
 ## In order to build a ranged SummarizedExperiment, these txps were removed.
 ## To keep these txps, and to skip adding ranges, use skipMeta=TRUE
 ## Example missing txps: [FBtr0307759, FBtr0084079, FBtr0084080,...]

# Clear *linkedTxomes* again

Finally, we clear the *linkedTxomes* table again so that the above examples will work. This is just
for the vignette code and not part of a typical workflow.

**Note:** Running this code will clear any information about *linkedTxomes*. Don't run this unless
you really want to clear this table!

```
if (interactive()) {
  bfcloc <- getTximetaBFC()
} else {
  bfcloc <- tempdir()
}
bfc <- BiocFileCache(bfcloc)
bfcinfo(bfc)
```

 ## # A tibble: 9 × 10
 ## rid rname create_time access_time rpath rtype fpath last_modified_time etag
 ## <chr> <chr> <chr> <chr> <chr> <chr> <chr> <dbl> <chr>
 ## 1 BFC2 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 2 BFC3 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 3 BFC4 exon… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 4 BFC5 gene… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 5 BFC6 genc… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 6 BFC7 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 7 BFC8 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 8 BFC9 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 9 BFC10 link… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## # ℹ 1 more variable: expires <dbl>

```
# only run the next line if you want to remove your linkedTxome table!
bfcremove(bfc, bfcquery(bfc, "linkedTxomeTbl")$rid)
bfcinfo(bfc)
```

 ## # A tibble: 8 × 10
 ## rid rname create_time access_time rpath rtype fpath last_modified_time etag
 ## <chr> <chr> <chr> <chr> <chr> <chr> <chr> <dbl> <chr>
 ## 1 BFC2 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 2 BFC3 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 3 BFC4 exon… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 4 BFC5 gene… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 5 BFC6 genc… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 6 BFC7 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 7 BFC8 Dros… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## 8 BFC9 txpR… 2026-02-06… 2026-02-06… /tmp… rela… 39d8… NA <NA>
 ## # ℹ 1 more variable: expires <dbl>

# alevin details

For *alevin* quantification, one should point to the `quants_mat.gz` file that contains the counts
for all of the cells. In order to `tximeta()` to work with *alevin* quantification, it requires that
*alevin* was run using gene IDs in the `tgMap` step and not gene symbols.

# Other quantifiers

`tximeta` can import the output from any quantifiers that are supported by `tximport`, and if these
are not *salmon*, *alevin*, or *Sailfish* output, it will simply return a non-ranged
*SummarizedExperiment* by default.

An alternative solution is to wrap other quantifiers in workflows that include metadata information
JSON files along with each quantification file. One can place these files in
`aux_info/meta_info.json` or any relative location specified by `customMetaInfo`, for example
`customMetaInfo="meta_info.json"`. This JSON file is located relative to the quantification file and
should contain a tag `index_seq_hash` with an associated value of the SHA-256 hash (digest) of the
reference transcripts. For computing the hash value of the reference transcripts, see the
[FastaDigest](https://github.com/COMBINE-lab/FastaDigest) python package. The hash value used by
*salmon* is the SHA-256 hash value of the reference sequences stripped of the header lines, and
concatenated together with the empty string (so only cDNA sequences combined without any new line
characters). *FastaDigest* can be installed with `pip install fasta_digest`.
