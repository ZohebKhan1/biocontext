# Statistical analysis and visualization of functional profiles for genes and gene clusters

# Overview

[clusterProfiler](https://www.bioconductor.org/packages/clusterProfiler) implements methods to
analyze and visualize functional profiles of genomic coordinates (supported by
[ChIPseeker](https://www.bioconductor.org/packages/ChIPseeker)), gene and gene clusters.

Use the [complete local reference book](book.md) for detailed workflows
and examples.

- Over-Representation Analysis
- Gene Set Enrichment Analysis
- Biological theme comparison

## Supported ontologies/pathways

- Disease Ontology (via [DOSE](https://www.bioconductor.org/packages/DOSE))
- [Network of Cancer Gene](http://ncg.kcl.ac.uk/) (via
 [DOSE](https://www.bioconductor.org/packages/DOSE))
- [DisGeNET](http://www.disgenet.org/web/DisGeNET/menu/home) (via
 [DOSE](https://www.bioconductor.org/packages/DOSE))
- Gene Ontology (supports many species with GO annotation query online via
 [AnnotationHub](https://bioconductor.org/packages/AnnotationHub/))
- KEGG Pathway and Module with latest online data (supports more than 4000 species listed in
 <http://www.genome.jp/kegg/catalog/org_list.html>)
- Reactome Pathway (via [ReactomePA](https://www.bioconductor.org/packages/ReactomePA))
- DAVID (via [RDAVIDWebService](https://www.bioconductor.org/packages/RDAVIDWebService))
- [Molecular Signatures Database](http://software.broadinstitute.org/gsea/msigdb)
 - hallmark gene sets
 - positional gene sets
 - curated gene sets
 - motif gene sets
 - computational gene sets
 - GO gene sets
 - oncogenic signatures
 - immunologic signatures
- Other Annotations
 - from other sources (e.g. [DisGeNET](http://www.disgenet.org/web/DisGeNET/menu/home) as [an
example](https://guangchuangyu.github.io/2015/05/use-clusterprofiler-as-an-universal-enrichment-analysis-tool/))
 - user's annotation
 - customized ontology
 - and many others

## Visualization

- barplot
- cnetplot
- dotplot
- emapplot
- gseaplot
- goplot
- upsetplot
