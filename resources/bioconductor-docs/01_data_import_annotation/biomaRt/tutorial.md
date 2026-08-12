# Using a BioMart other than Ensembl

# Introduction

In recent years a wealth of biological data has become available in public data repositories. Easy
access to these valuable data resources and firm integration with data analysis is needed for
comprehensive bioinformatics data analysis. The
*[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* package, provides an interface to a
growing collection of databases implementing the [BioMart software
suite](https://www.ensembl.org/info/data/biomart/index.html). The package enables retrieval of large
amounts of data in a uniform way without the need to know the underlying database schemas or write
complex SQL queries. Examples of BioMart databases are Ensembl, Uniprot and HapMap. These major
databases give *[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* users direct access to a
diverse set of data and enable a wide range of powerful online queries from R.

There are a small number of non-Ensembl databases that offer a BioMart interface to their data. The
*[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* package can be used to access these in a
very similar fashion to Ensembl. The majority of
*[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* functions will work in the same manner,
but the construction of the initial Mart object requires slightly more setup. In this section we
demonstrate the setting requires to query [Wormbase
ParaSite](https://parasite.wormbase.org/index.html) and
[Phytozome](https://phytozome.jgi.doe.gov/pz/portal.html). First we need to load
*[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)*.

```r
library(biomaRt)
```

## Wormbase

To demonstrate the use of the *[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* package
with non-Ensembl databases the next query is performed using the Wormbase ParaSite BioMart. In this
example, we use the `listMarts()` function to find the name of the available marts, given the URL of
Wormbase. We use this to connect to Wormbase BioMart using the `useMart()` function. Note that we
use the `https` address and must provide the port as `443`. Queries to WormBase will fail without
these options.

```r
listMarts(host = "parasite.wormbase.org")
```

 ## Error in `req_perform()`:
 ##! Failed to perform HTTP request.
 ## Caused by error in `curl::curl_fetch_memory()`:
 ##! Unsupported protocol [parasite.wormbase.org]:
 ## Received HTTP/0.9 when not allowed

```r
wormbase <- useMart(
  biomart = "parasite_mart",
  host = "https://parasite.wormbase.org",
  port = 443
)
```

We can then use functions described earlier in this vignette to find and select the gene dataset,
and print the first 6 available attributes and filters. Then we use a list of gene names as filter
and retrieve associated transcript IDs and the transcript biotype.

```r
listDatasets(wormbase)
```

 ## dataset description version
 ## 1 wbps_gene All Species (WBPS19) 19

```r
wormbase <- useDataset(mart = wormbase, dataset = "wbps_gene")
head(listFilters(wormbase))
```

 ## name description
 ## 1 species_id_1010 Genome
 ## 2 nematode_clade_1010 Nematode Clade
 ## 3 chromosome_name Chromosome name
 ## 4 start Start
 ## 5 end End
 ## 6 strand Strand

```r
head(listAttributes(wormbase))
```

 ## name description page
 ## 1 species_id_key Internal Name feature_page
 ## 2 production_name_1010 Genome project feature_page
 ## 3 display_name_1010 Genome name feature_page
 ## 4 taxonomy_id_1010 Taxonomy ID feature_page
 ## 5 assembly_accession_1010 Assembly accession feature_page
 ## 6 nematode_clade_1010 Nematode clade feature_page

```r
getBM(
  attributes = c(
    "external_gene_id",
    "wbps_transcript_id",
    "transcript_biotype"
  ),
  filters = "gene_name",
  values = c("unc-26", "his-33"),
  mart = wormbase
)
```

 ## external_gene_id wbps_transcript_id transcript_biotype
 ## 1 his-33 F17E9.13.1 protein_coding
 ## 2 unc-26 JC8.10a.1 protein_coding
 ## 3 unc-26 JC8.10b.1 protein_coding
 ## 4 unc-26 JC8.10c.1 protein_coding
 ## 5 unc-26 JC8.10d.1 protein_coding

## Phytozome

### Version 12

The Phytozome 12 BioMart was [retired](https://jgi.doe.gov/more-intuitive-phytozome-interface/) in
August 2021 and can not longer be accessed.

### Version 13

Version 13 of Phytozome can be found at https://phytozome-next.jgi.doe.gov/ and if you wish to query
that version the URL used to create the Mart object must reflect that.

```r
phytozome_v13 <- useMart(
  biomart = "phytozome_mart",
  dataset = "phytozome",
  host = "https://phytozome-next.jgi.doe.gov"
)
```

Once this is set up the usual *[biomaRt](https://bioconductor.org/packages/3.22/biomaRt)* functions
can be used to interrogate the database options and run queries.

```r
getBM(
  attributes = c("organism_name", "gene_name1"),
  filters = "gene_name_filter",
  values = "82092",
  mart = phytozome_v13
)
```

 ## organism_name gene_name1
 ## 1 Smoellendorffii_v1.0 82092
