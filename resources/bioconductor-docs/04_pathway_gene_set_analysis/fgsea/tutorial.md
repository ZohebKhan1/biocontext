# Gene set co-regulation analysis tutorial

This vignette describes GESECA (gene set co-regulation analysis): a method to identify gene sets
that have high gene correlation. We will show how GESECA can be used to find regulated pathways in
multi-conditional data, where there is no obvious contrast that can be used to rank genes for GSEA
analysis. As examples we will consider a time course microarray experiment and a spatial
transcriptomics dataset.

## Overiew of GESECA method

GESECA takes as an input:

- *E* - gene expression matrix, where rows and columns correspond to genes and samples respectively.
- *P* - list of gene sets (i.e. [hallmark gene
 sets](http://www.gsea-msigdb.org/gsea/msigdb/human/collections.jsp#H)).

**Note**: genes identifier type should be the same for both elements of *P* and for row names of
matrix *E*.

By default, GESECA method performs centering for rows of the matrix *E*. So, after that, the gene
values are assumed to have zero mean. Then for each gene set *p* in *P* let us introduce the gene
set score in the following form:

```
score <- sum(colSums(E[p, ])**2) / length(p)
```

This score was inspired by the variance of principal components from the principal component
analysis (PCA). Therefore, the given score can be viewed in terms of explained variance by the gene
set *p*. Geometrically, this can be considered as an embedding of samples into a one-dimensional
space, given by a unit vector in which nonzero positions correspond to genes from gene set *p*.

In the case of row-centered matrix *E* the variance of highly correlated genes is summed up to a
higher score. While the genes that are not correlated cancel each other and the total gene set
variance is low. See the toy example:

Toy example of GESECA score calculation

Another major feature of the proposed score is that it does not require an explicit sample
annotation or a contrast. As the result, GESECA can be applied to various types of sequencing
technologies: RNA-seq, single-cell sequencing, spatial RNA-seq, etc.

To assess statistical significance for a given gene set *p* we calculate an empirical P-value by
using gene permutations. The definition of the P-value is given by the following expression: $$
\mathrm{P} \left(\text{random score} \geqslant \text{score of p} \right). $$ The estimation
of the given P-value is done by sampling random gene sets with the same size as *p* from the row
names of matrix *E*. In practice, the theoretical P-value can be extremely small, so we use the
adaptive multilevel Markov Chain Monte Carlo scheme, that we used previously in `fgseaMultilevel`
procedure. For more details, see the [preprint](https://www.biorxiv.org/content/10.1101/060012v3).

## Analysis of time course data

In the first example we will consider a time course data of Th2 activation from the dataset
GSE200250.

First, let prepare the dataset. We load it from Gene Expression Omnibus, apply log and quantile
normalization and filter lowly expressed genes.

```
library(GEOquery)
library(limma)

gse200250 <- getGEO("GSE200250", AnnotGPL = TRUE)[[1]]

es <- gse200250
es <- es[, grep("Th2_", es$title)]
es$time <- as.numeric(gsub(" hours", "", es$`time point:ch1`))
es <- es[, order(es$time)]

exprs(es) <- normalizeBetweenArrays(log2(exprs(es)), method="quantile")

es <- es[order(rowMeans(exprs(es)), decreasing=TRUE), ]
es <- es[!duplicated(fData(es)$`Gene ID`), ]
rownames(es) <- fData(es)$`Gene ID`
es <- es[!grepl("///", rownames(es)), ]
es <- es[rownames(es) != "", ]

fData(es) <- fData(es)[, c("ID", "Gene ID", "Gene symbol")]

es <- es[head(order(rowMeans(exprs(es)), decreasing=TRUE), 12000), ]
head(exprs(es))
#>       GSM6025497 GSM6025506 GSM6025498 GSM6025507 GSM6025499 GSM6025508
#> 20042   15.95540   15.98219   15.98219   16.00741   15.93798   15.96460
#> 20005   15.93039   15.96460   15.90505   15.91366   15.95540   15.72169
#> 20088   15.93798   15.91054   15.84485   15.87839   15.92647   15.91366
#> 20102   15.88375   15.78037   15.82486   15.87013   15.98219   15.94702
#> 20103   15.84885   15.86085   15.77502   15.84141   15.72169   15.85271
#> 20090   15.91054   15.80253   15.93798   15.74269   15.96460   15.90505
#>       GSM6025500 GSM6025509 GSM6025501 GSM6025510 GSM6025502 GSM6025511
#> 20042   15.93039   16.00741   15.94702   16.00741   15.92647   15.98219
#> 20005   15.89942   15.94702   15.95540   15.79744   15.91366   15.80778
#> 20088   15.84485   15.92647   15.86573   15.86573   15.80778   15.88972
#> 20102   15.75168   15.90505   15.79744   15.78575   15.91054   15.89411
#> 20103   15.86085   15.82057   15.91054   15.91981   15.91981   15.70228
#> 20090   15.84885   15.88375   15.76562   15.82057   15.76024   15.82057
#>       GSM6025503 GSM6025512 GSM6025504 GSM6025513 GSM6025505 GSM6025514
#> 20042   15.98219   16.00741   15.96460   16.00741   16.00741   16.00741
#> 20005   15.90505   15.84485   15.85590   15.78575   15.83803   15.89411
#> 20088   15.82486   15.83803   15.86573   15.93039   15.85271   15.87839
#> 20102   15.86085   15.75168   15.88972   15.94702   15.91054   15.88972
#> 20103   15.84141   15.93039   15.90505   15.89942   15.90505   15.91054
#> 20090   15.93798   15.83089   15.91366   15.73523   15.91981   15.84885
```

Then we obtain the pathway list. Here we use Hallmarks collection from MSigDB database.

```
library(msigdbr)
pathwaysDF <- msigdbr(species="mouse", collection="H")
#> Using human MSigDB with ortholog mapping to mouse. Use `db_species = "MM"` for mouse-native gene sets.
#> This message is displayed once per session.
pathways <- split(as.character(pathwaysDF$ncbi_gene), pathwaysDF$gs_name)
```

Now we can run GESECA analysis:

```
library(fgsea)
set.seed(1)
gesecaRes <- geseca(pathways, exprs(es), minSize = 15, maxSize = 500)
```

The resulting table contain GESECA scores and the corresponding P-values:

```
head(gesecaRes, 10)
#>                                pathway    pctVar         pval         padj
#>                                 <char>     <num>        <num>        <num>
#>  1:               HALLMARK_E2F_TARGETS 1.5886651 3.726293e-48 1.415991e-46
#>  2:                   HALLMARK_HYPOXIA 1.1041997 3.509752e-34 6.668528e-33
#>  3:            HALLMARK_G2M_CHECKPOINT 1.0281398 1.078730e-32 1.366391e-31
#>  4:            HALLMARK_MYC_TARGETS_V1 0.5788220 6.993558e-21 6.643880e-20
#>  5:                HALLMARK_GLYCOLYSIS 0.5963190 1.773982e-20 1.348227e-19
#>  6:            HALLMARK_MYC_TARGETS_V2 0.7244975 3.370652e-20 2.134746e-19
#>  7:   HALLMARK_TNFA_SIGNALING_VIA_NFKB 0.5448079 1.399954e-18 7.599753e-18
#>  8:           HALLMARK_MITOTIC_SPINDLE 0.3461497 4.304476e-13 2.044626e-12
#>  9:       HALLMARK_IL2_STAT5_SIGNALING 0.2528643 6.688237e-10 2.823922e-09
#> 10: HALLMARK_INTERFERON_GAMMA_RESPONSE 0.2509811 7.796336e-10 2.962608e-09
#>       log2err  size
#>         <num> <int>
#>  1: 1.8030940   181
#>  2: 1.5161076   149
#>  3: 1.4815676   175
#>  4: 1.1778933   186
#>  5: 1.1690700   153
#>  6: 1.1601796    50
#>  7: 1.1053366   155
#>  8: 0.9214260   165
#>  9: 0.8012156   177
#> 10: 0.8012156   156
```

We can plot gene expression profile of HALLMARK_E2F_TARGETS pathway and see that these genes are
strongly activated at 24 hours time point:

```
plotCoregulationProfile(pathway=pathways[["HALLMARK_E2F_TARGETS"]],
                        E=exprs(es), titles = es$title, conditions=es$`time point:ch1`)
#> Warning in fortify(data, ...): Arguments in `...` must be used.
#> ✖ Problematic argument:
#> • show.legend = FALSE
#> ℹ Did you misspell an argument name?
```

Hypoxia genes have slightly different profile, getting activated around 48 hours:

```
plotCoregulationProfile(pathway=pathways[["HALLMARK_HYPOXIA"]],
                        E=exprs(es), titles = es$title, conditions=es$`time point:ch1`)
#> Warning in fortify(data, ...): Arguments in `...` must be used.
#> ✖ Problematic argument:
#> • show.legend = FALSE
#> ℹ Did you misspell an argument name?
```

To get an overview of the top pathway patterns we can use `plotGesecaTable` function:

```
plotGesecaTable(gesecaRes |> head(10), pathways, E=exprs(es), titles = es$title)
#> Warning: Using `size` aesthetic for lines was deprecated in ggplot2 3.4.0.
#> ℹ Please use `linewidth` instead.
#> ℹ The deprecated feature was likely used in the fgsea package.
#>   Please report the issue at <https://github.com/ctlab/fgsea/issues>.
#> This warning is displayed once every 8 hours.
#> Call `lifecycle::last_lifecycle_warnings()` to see where this warning was
#> generated.
```

When the expression matrix contains many samples, a PCA-reduced expression matrix can be used
instead of the full matrix to improve the performance. Let reduce the sample space from 18 to 10
dimensions, preserving as much gene variation as possible.

```
E <- t(base::scale(t(exprs(es)), scale=FALSE))
pcaRev <- prcomp(E, center=FALSE)
Ered <- pcaRev$x[, 1:10]
dim(Ered)
#> [1] 12000    10
```

Now we can run GESECA on the reduced matrix, however we need to disable automatic centering, as we
already have done it before the reduction.

```
set.seed(1)
gesecaResRed <- geseca(pathways, Ered, minSize = 15, maxSize = 500, center=FALSE)
head(gesecaResRed, 10)
#>                                pathway    pctVar         pval         padj
#>                                 <char>     <num>        <num>        <num>
#>  1:               HALLMARK_E2F_TARGETS 1.6274291 1.666912e-47 6.167575e-46
#>  2:                   HALLMARK_HYPOXIA 1.1242216 4.502652e-33 5.642121e-32
#>  3:            HALLMARK_G2M_CHECKPOINT 1.0527938 4.574693e-33 5.642121e-32
#>  4:            HALLMARK_MYC_TARGETS_V2 0.7422724 8.826326e-21 6.602863e-20
#>  5:            HALLMARK_MYC_TARGETS_V1 0.5923285 8.922788e-21 6.602863e-20
#>  6:                HALLMARK_GLYCOLYSIS 0.6088536 5.051598e-20 3.115152e-19
#>  7:   HALLMARK_TNFA_SIGNALING_VIA_NFKB 0.5542621 3.330004e-18 1.760145e-17
#>  8:           HALLMARK_MITOTIC_SPINDLE 0.3530595 2.868317e-12 1.326596e-11
#>  9:       HALLMARK_IL2_STAT5_SIGNALING 0.2584534 6.767387e-10 2.782148e-09
#> 10: HALLMARK_INTERFERON_GAMMA_RESPONSE 0.2543181 1.169264e-09 4.326276e-09
#>       log2err  size
#>         <num> <int>
#>  1: 1.7915725   181
#>  2: 1.4885397   149
#>  3: 1.4885397   175
#>  4: 1.1778933    50
#>  5: 1.1778933   186
#>  6: 1.1512205   153
#>  7: 1.0959293   155
#>  8: 0.8986712   165
#>  9: 0.8012156   177
#> 10: 0.7881868   156
```

The scores and P-values are similar to the ones we obtained for the full matrix.

```
library(ggplot2)
ggplot(data=merge(gesecaRes[, list(pathway, logPvalFull=-log10(pval))],
                  gesecaResRed[, list(pathway, logPvalRed=-log10(pval))])) +
    geom_point(aes(x=logPvalFull, y=logPvalRed)) +
    coord_fixed() + theme_classic()
```

## Analysis of single-cell RNA-seq

Let us load necessary libraries. We a going to use `Seurat` package for working with singe cell
data.

```
suppressMessages(library(Seurat))
```

As an example dataset we will use GSE116240
(<https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE116240>). The dataset features single cell
RNA sequencing of aortic CD45+ cells and foam cells from atherosclerotic aorta and is extensively
described in the corresponding publication (<https://pubmed.ncbi.nlm.nih.gov/30359200/>). We also
thank the authors for providing the corresponding Seurat object used for the publication.

```
obj <- readRDS(url("https://alserglab.wustl.edu/files/fgsea/GSE116240.rds"))
obj
#> An object of class Seurat
#> 27998 features across 3781 samples within 1 assay
#> Active assay: RNA (27998 features, 3623 variable features)
#>  2 layers present: counts, data
#>  2 dimensional reductions calculated: pca, tsne

newIds <- c("0"="Adventitial MF",
            "3"="Adventitial MF",
            "5"="Adventitial MF",
            "1"="Intimal non-foamy MF",
            "2"="Intimal non-foamy MF",
            "4"="Intimal foamy MF",
            "7"="ISG+ MF",
            "8"="Proliferating cells",
            "9"="T-cells",
            "6"="cDC1",
            "10"="cDC2",
            "11"="Non-immune cells")

obj <- RenameIdents(obj, newIds)

DimPlot(obj) + ggplot2::coord_fixed()
```

We apply an appropriate normalization (note that we are using 10000 genes, which will be later used
as a gene universe for the analysis):

```
obj <- SCTransform(obj, verbose = FALSE, variable.features.n = 10000)
```

To speed up the analysis, instead of using the full transformed gene expression matrix, we will
consider only its first principal components. Note that a "reverse" PCA should be done: the
principal components should correspond to linear combinations of the cells, not linear combinations
of the genes as in "normal" PCA. By default `SCTransform` returns centered gene expression, so we
can run PCA directly.

```
length(VariableFeatures(obj)) # make sure it's a full gene universe of 10000 genes
#> [1] 10000
obj <- RunPCA(obj, assay = "SCT", verbose = FALSE,
                rev.pca = TRUE, reduction.name = "pca.rev",
              reduction.key="PCR_", npcs = 50)

E <- obj@reductions$pca.rev@feature.loadings
```

Following the authors we are going to use KEGG pathway collection.

```
library(msigdbr)

pathwaysDF <- msigdbr(species="mouse", collection="C2", subcollection = "CP:KEGG_LEGACY")
pathways <- split(pathwaysDF$gene_symbol, pathwaysDF$gs_name)
```

Now we can run the analysis (we set `center=FALSE` because we use the reduced matrix):

```
set.seed(1)
gesecaRes <- geseca(pathways, E, minSize = 5, maxSize = 500, center = FALSE, eps=1e-100)

head(gesecaRes, 10)
#>                                      pathway    pctVar         pval
#>                                       <char>     <num>        <num>
#>  1:                            KEGG_RIBOSOME 1.1844859 6.172881e-40
#>  2:           KEGG_GRAFT_VERSUS_HOST_DISEASE 0.6313148 3.370652e-20
#>  3:                 KEGG_ALLOGRAFT_REJECTION 0.5474674 2.673392e-19
#>  4:            KEGG_TYPE_I_DIABETES_MELLITUS 0.5770717 5.500361e-19
#>  5:                KEGG_LEISHMANIA_INFECTION 0.4320958 1.261768e-17
#>  6: KEGG_ANTIGEN_PROCESSING_AND_PRESENTATION 0.4150349 2.242584e-17
#>  7:          KEGG_AUTOIMMUNE_THYROID_DISEASE 0.6066166 1.701748e-16
#>  8:                            KEGG_LYSOSOME 0.2791275 1.922874e-16
#>  9:                              KEGG_ASTHMA 0.9968910 3.864738e-16
#> 10: KEGG_NOD_LIKE_RECEPTOR_SIGNALING_PATHWAY 0.4004829 5.916767e-16
#>             padj  log2err  size
#>            <num>    <num> <int>
#>  1: 4.506203e-38 1.640742    61
#>  2: 1.230288e-18 1.160180    26
#>  3: 6.505253e-18 1.133090    24
#>  4: 1.003816e-17 1.123915    26
#>  5: 1.842182e-16 1.076868    57
#>  6: 2.728477e-16 1.067210    49
#>  7: 1.754622e-15 1.047626    21
#>  8: 1.754622e-15 1.037696   102
#>  9: 3.134732e-15 1.027670    12
#> 10: 4.319240e-15 1.027670    50
```

Now we can plot profiles of the top pathways (we need to specify the reduction as we are using the
one from the publication):

```
topPathways <- gesecaRes[, pathway] |> head(4)
titles <- sub("KEGG_", "", topPathways)

ps <- plotCoregulationProfileReduction(pathways[topPathways], obj,
                                       title=titles,
                                       reduction="tsne")
cowplot::plot_grid(plotlist=ps[1:4], ncol=2)
```

We can see that inflammatory pathways (e.g. KEGG_LEISHMANIA_INFECTION) are more associated with the
non-foamy intimal macrophages, which was one of the main points of the Kim et al. Another pathway
highlighted by the authors, KEGG_LYSOSOME, is specific to intimal foamy macrophages:

```
plotCoregulationProfileReduction(pathways$KEGG_LYSOSOME,
                               obj,
                               title=sprintf("KEGG_LYSOSOME (pval=%.2g)",
                                             gesecaRes[match("KEGG_LYSOSOME", pathway), pval]),
                               reduction="tsne")
```

## Analysis of spatial transcriptomic data

### Analysis of 10X visium spatial data

Similarly to single cell RNA-seq, GESECA can be used for gene set enrichment analysis of spatial
transcriptomics profiling. As an example we will use glioblastoma sample from Ravi et al
(<https://pubmed.ncbi.nlm.nih.gov/35700707/>).

```
library(Seurat)

obj <- readRDS(url("https://alserglab.wustl.edu/files/fgsea/275_T_ST_Seurat.rds"))
```

As for scRNA-seq, we apply normalization for 10000 genes and run a do a PCA reduction.

```
obj <- SCTransform(obj, assay = "Spatial", verbose = FALSE, variable.features.n = 10000)

obj <- RunPCA(obj, assay = "SCT", verbose = FALSE,
                rev.pca = TRUE, reduction.name = "pca.rev",
              reduction.key="PCR_", npcs = 50)

E <- obj@reductions$pca.rev@feature.loadings
```

We will use HALLMARK pathways as the gene set collection.

```
library(msigdbr)
pathwaysDF <- msigdbr(species="human", collection="H")
pathways <- split(pathwaysDF$gene_symbol, pathwaysDF$gs_name)
```

Now we can run the analysis (remember, we set `center=FALSE` because we use the reduced matrix):

```
set.seed(1)
gesecaRes <- geseca(pathways, E, minSize = 15, maxSize = 500, center = FALSE)
#> Warning in geseca(pathways, E, minSize = 15, maxSize = 500, center = FALSE):
#> For some pathways, in reality P-values are less than 1e-50. You can set the
#> `eps` argument to zero for better estimation.

head(gesecaRes, 10)
#>                                        pathway    pctVar         pval
#>                                         <char>     <num>        <num>
#>  1:                           HALLMARK_HYPOXIA 1.4045546 1.000000e-50
#>  2:           HALLMARK_TNFA_SIGNALING_VIA_NFKB 0.8074264 3.813784e-43
#>  3: HALLMARK_EPITHELIAL_MESENCHYMAL_TRANSITION 0.5666230 3.680479e-31
#>  4:         HALLMARK_INTERFERON_GAMMA_RESPONSE 0.4665269 2.003692e-26
#>  5:                  HALLMARK_MTORC1_SIGNALING 0.3055225 1.425641e-18
#>  6:                        HALLMARK_GLYCOLYSIS 0.2273506 1.922010e-13
#>  7:         HALLMARK_INTERFERON_ALPHA_RESPONSE 0.4682703 5.923220e-13
#>  8:                         HALLMARK_APOPTOSIS 0.2020093 1.560500e-12
#>  9:             HALLMARK_INFLAMMATORY_RESPONSE 0.1978061 4.946945e-10
#> 10:         HALLMARK_OXIDATIVE_PHOSPHORYLATION 0.1570350 5.944348e-09
#>             padj   log2err  size
#>            <num>     <num> <int>
#>  1: 3.000000e-49        NA   154
#>  2: 5.720676e-42 1.7026781   157
#>  3: 3.680479e-30 1.4462029   147
#>  4: 1.502769e-25 1.3267161   148
#>  5: 8.553846e-18 1.1053366   176
#>  6: 9.610052e-13 0.9325952   145
#>  7: 2.538523e-12 0.9214260    77
#>  8: 5.851874e-12 0.8986712   126
#>  9: 1.648982e-09 0.8012156   114
#> 10: 1.783305e-08 0.7614608   170
```

Finally, let us plot spatial expression of the top four pathways:

```
topPathways <- gesecaRes[, pathway] |> head(4)
titles <- sub("HALLMARK_", "", topPathways)

ps <- plotCoregulationProfileSpatial(pathways[topPathways], obj,
                                     title=titles,
                                     pt.size.factor=2.5)
cowplot::plot_grid(plotlist=ps, ncol=2)
```

Consistent with the Ravi et al, we see a distinct hypoxic region (defined by HALLMARK_HYPOXIA) and a
reactive immune region (defined by HALLMARK_INTERFERON_GAMMA_RESPONSE). Further, we can explore
behavior of HALLMARK_OXIDATIVE_PHOSPHORYLATION pathway to see that oxidative metabolism is more
characteristic to the "normal" tissue region:

```
plotCoregulationProfileSpatial(pathways$HALLMARK_OXIDATIVE_PHOSPHORYLATION,
                               obj,
                               pt.size.factor=2.5,
                               title=sprintf("HALLMARK_OXIDATIVE_PHOSPHORYLATION\n(pval=%.2g)",
                                             gesecaRes[
                                                 match("HALLMARK_OXIDATIVE_PHOSPHORYLATION", pathway),
                                                 pval]))
#> [[1]]
```

### Analysis of 10X xenium spatial transcriptomics data

GESECA can also be applied to spatial transcriptomics data generated by high-plex in situ
technologies with subcellular resolution, such as 10X Genomics' Xenium platform. In this example, we
analyze a Human Ovarian Cancer sample profiled using the Xenium 5K panel.

The raw data used in this analysis is publicly available and can be downloaded from the following
sources:

- Xenium output bundle: [Download
link](https://s3-us-west-2.amazonaws.com/10x.files/samples/xenium/3.0.0/Xenium_Prime_Ovarian_Cancer_FFPE_XRrun/Xenium_Prime_Ovarian_Cancer_FFPE_XRrun_outs.zip)
- Cell annotation file: [Download
link](https://cf.10xgenomics.com/samples/xenium/3.0.0/Xenium_Prime_Ovarian_Cancer_FFPE_XRrun/Xenium_Prime_Ovarian_Cancer_FFPE_XRrun_cell_groups.csv)

To prepare the data for GESECA analysis, we carried out the following custom preprocessing steps
using Seurat:

```
fldr <- ""         # Path to downloaded Xenium output
annf_path <- ""    # Path to downloaded cell annotation CSV

# Load the Xenium data as a Seurat object
xobj <- Seurat::LoadXenium(fldr, molecule.coordinates = FALSE)

# Remove assays not needed for downstream analysis
for (nm in names(xobj@assays)[-1]) {
    xobj@assays[[nm]] <- NULL
}

# Add spatial coordinates to metadata
coords <- data.table::as.data.table(xobj@images$fov@boundaries$centroids@coords)
xobj@meta.data <- cbind(xobj@meta.data, coords)

# Integrate external cell annotations
annot <- data.table::fread(annf_path)
xobj <- xobj[, rownames(xobj@meta.data) %in% annot$cell_id]
xobj@meta.data$annotation <- annot[match(rownames(xobj@meta.data), annot$cell_id), ]$group
xobj@meta.data$annotation <- factor(xobj@meta.data$annotation)

# Filter out low-quality cells
xobj <- subset(xobj, subset = nCount_Xenium > 50)

# Optional: Crop the region and subsample the object
# These steps reduce size and complexity for a more compact vignette
# Helps keep the vignette lightweight and quick to render
xobj <- xobj[, xobj$x < 3000 & xobj$y < 4000]
set.seed(1)
xobj <- xobj[, sample.int(ncol(xobj), 40000)]

# Normalize and scale data
xobj <- NormalizeData(xobj, normalization.method = "LogNormalize", scale.factor = 1000, verbose = FALSE)
xobj <- FindVariableFeatures(xobj, nfeatures = 2000, verbose = FALSE)
xobj <- ScaleData(xobj, verbose = FALSE)

# Perform PCA and UMAP dimensionality reduction
xobj <- RunPCA(xobj, verbose = FALSE)
xobj <- RunUMAP(xobj, dims = 1:20)
```

Additionally, before saving the object for use in the vignette, we remove the following components
from the Seurat object to reduce its size and keep it tidy:

```
xobj@reductions$pca <- NULL
xobj@assays$Xenium@layers$scale.data <- NULL
xobj@assays$Xenium@layers$data <- NULL
```

For this tutorial, we directly use the Seurat object that was preprocessed using the steps described
above:

```
xobj <- readRDS(url("https://alserglab.wustl.edu/files/fgsea/xenium-human-ovarian-cancer.rds"))

xobj <- NormalizeData(xobj, verbose = FALSE)
xobj <- ScaleData(xobj, verbose = FALSE)
```

The plot below compares the spatial localization of annotated cells (left) with their
transcriptional similarity via UMAP (right):

```
p1 <- ImageDimPlot(xobj, group.by = "annotation",
                   dark.background = FALSE, size = 0.5,
                   flip_xy = TRUE) +
    theme(legend.position = "none")

p1 <- suppressMessages(p1 + coord_flip() + scale_x_reverse() + theme(aspect.ratio = 1.0))

p2 <- DimPlot(xobj, group.by = "annotation", raster = FALSE, pt.size = 0.5, stroke.size = 0.0) +
    coord_fixed()

p1 | p2
```

The command `suppressMessages(p1 + coord_flip() + scale_x_reverse() + theme(aspect.ratio = 1.0))`
adjusts the plot orientation to match the spatial layout shown in the [Xenium Explorer web
viewer](https://www.10xgenomics.com/datasets/xenium-prime-ffpe-human-ovarian-cancer), ensuring
consistency between the analysis and the original data presentation.

We will now perform the GESECA analysis in the same manner as previously demonstrated with both
scRNA-seq and Visium datasets. For consistency and interpretability, we will once again use the
HALLMARK gene sets from the MSigDB collection.

```
xobj <- RunPCA(xobj, verbose = F, rev.pca = TRUE, reduction.name = "pca.rev",
               reduction.key="PCR_", npcs=30)

E <- xobj@reductions$pca.rev@feature.loadings

gsets <- msigdbr(species="human", collection="H")
gsets <- split(gsets$gene_symbol, gsets$gs_name)

set.seed(1)
gesecaRes <- geseca(gsets, E, minSize = 15, maxSize = 500, center = FALSE, eps = 1e-100)

head(gesecaRes, 10)
#>                                        pathway    pctVar         pval
#>                                         <char>     <num>        <num>
#>  1:                       HALLMARK_E2F_TARGETS 4.8099688 1.010310e-47
#>  2: HALLMARK_EPITHELIAL_MESENCHYMAL_TRANSITION 4.2252864 6.218037e-45
#>  3:                    HALLMARK_G2M_CHECKPOINT 4.4643380 6.716647e-44
#>  4:         HALLMARK_INTERFERON_GAMMA_RESPONSE 2.0646007 2.455835e-22
#>  5:         HALLMARK_INTERFERON_ALPHA_RESPONSE 2.2680902 3.409619e-20
#>  6:                   HALLMARK_MITOTIC_SPINDLE 2.0814609 6.390584e-19
#>  7:                  HALLMARK_MTORC1_SIGNALING 1.1236865 4.151984e-12
#>  8:                    HALLMARK_MYC_TARGETS_V1 1.2533092 2.328815e-11
#>  9:                           HALLMARK_HYPOXIA 1.0042856 1.929976e-10
#> 10:           HALLMARK_TNFA_SIGNALING_VIA_NFKB 0.9767425 4.630348e-10
#>             padj   log2err  size
#>            <num>     <num> <int>
#>  1: 2.727837e-46 1.7973425    62
#>  2: 8.394350e-44 1.7387813    88
#>  3: 6.044982e-43 1.7208244    59
#>  4: 1.657689e-21 1.2210538    70
#>  5: 1.841194e-19 1.1601796    33
#>  6: 2.875763e-18 1.1239150    26
#>  7: 1.601480e-11 0.8870750    41
#>  8: 7.859752e-11 0.8634154    15
#>  9: 5.789928e-10 0.8266573    58
#> 10: 1.250194e-09 0.8012156    74
```

Next, we visualize the top enriched pathways identified by GESECA using UMAP embeddings. This allows
us to assess transcriptional patterns of gene set activity across cells.

```
topPathways <- gesecaRes[, pathway] |> head(6)
titles <- sub("HALLMARK_", "", topPathways)
pvals <- gesecaRes[match(topPathways, pathway), pval]
pvals <- paste("p-value:", formatC(pvals, digits = 1, format = "e"))

titles <- paste(titles, pvals, sep = "\n")

plots <- fgsea::plotCoregulationProfileReduction(
    gsets[topPathways], xobj,
    reduction = "umap", title = titles,
    raster = TRUE, raster.dpi = c(500, 500),
    pt.size = 2.5
)

plots <- lapply(plots, function(p){
    p + theme(plot.title = element_text(hjust=0), text = element_text(size=10))
})

cowplot::plot_grid(plotlist = plots, ncol = 2)
```

In addition to UMAP plots, you can visualize the spatial expression patterns of the most enriched
pathways using the `plotCoregulationProfileImage` function. This enables a detailed view of how
pathway activities vary across spatial coordinates:

```
imagePlots <- plotCoregulationProfileImage(
    gsets[topPathways], object = xobj,
    dark.background = FALSE,
    title = titles,
    size=0.8
)

imagePlots <- lapply(imagePlots, function(p){
    suppressMessages(
        p + coord_flip() + scale_x_reverse() +
            theme(plot.title = element_text(hjust=0), text = element_text(size=10), aspect.ratio = 1.0)
    )
})

cowplot::plot_grid(plotlist = imagePlots, ncol = 2)
```
