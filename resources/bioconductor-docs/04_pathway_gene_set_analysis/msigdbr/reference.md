# msigdbr API reference

Generated from the canonical package `man/*.Rd` sources. Package version `26.1.0`; 4 reference
topics.

**Aliases:** `msigdbr_collections`

**Canonical source:** `repo/man/msigdbr_collections.Rd`

## `msigdbr_collections`: List the collections available in the msigdbr package

### Description

List the collections available in the msigdbr package

### Usage

```r
msigdbr_collections(db_species = "HS")
```

### Arguments

| Argument | Description |
| --- | --- |
| `db_species` | Species abbreviation for the human or mouse databases (`"HS"` or `"MM"`). |

### Value

A data frame of the available collections.

### Examples

```r
msigdbr_collections()
```

**Aliases:** `msigdbr_species`

**Canonical source:** `repo/man/msigdbr_species.Rd`

## `msigdbr_species`: List the species available in the msigdbr package

### Description

List the species available in the msigdbr package

### Usage

```r
msigdbr_species()
```

### Value

A data frame of the available species.

### Examples

```r
msigdbr_species()
```

**Aliases:** `msigdbr-package`

**Canonical source:** `repo/man/msigdbr-package.Rd`

## `msigdbr-package`: msigdbr: MSigDB Gene Sets for Multiple Organisms in a Tidy Data Format

### Description

Provides the 'Molecular Signatures Database' (MSigDB) gene sets typically used with the 'Gene Set
Enrichment Analysis' (GSEA) software (Subramanian et al. 2005
\Sexpr\[results=rd\]{tools:::Rd_expr_doi("10.1073/pnas.0506580102")}, Liberzon et al. 2015
\Sexpr\[results=rd\]{tools:::Rd_expr_doi("10.1016/j.cels.2015.12.004")}, Castanza et al. 2023
\Sexpr\[results=rd\]{tools:::Rd_expr_doi("10.1038/s41592-023-02014-7")}) as an R data frame. The
package includes the human genes as listed in MSigDB as well as the corresponding symbols and IDs
for frequently studied model organisms such as mouse, rat, pig, fly, and yeast.

### See Also

Useful links:

- <https://igordot.github.io/msigdbr/>

- Report bugs at <https://github.com/igordot/msigdbr/issues>

**Aliases:** `msigdbr`

**Canonical source:** `repo/man/msigdbr.Rd`

## `msigdbr`: Retrieve the gene sets data frame

### Description

Retrieve a data frame of gene sets and their member genes. The original human genes can be converted
into their corresponding counterparts in various model organisms, including mouse, rat, pig,
zebrafish, fly, and yeast. The output includes gene symbols along with NCBI and Ensembl IDs.

### Usage

```r
msigdbr(
  db_species = "HS",
  species = "human",
  collection = NULL,
  subcollection = NULL,
  category = deprecated(),
  subcategory = deprecated()
)
```

### Arguments

| Argument | Description |
| --- | --- |
| `db_species` | Species abbreviation for the human or mouse databases (`"HS"` or `"MM"`). |
| `species` | Species name for output genes, such as `"Homo sapiens"` or `"Mus musculus"`. Both scientific and common names are acceptable. Use `msigdbr_species()` to see the available options. |
| `collection` | Collection abbreviation, such as `"H"` or `"C1"`. Use `msigdbr_collections()` to see the available options. |
| `subcollection` | Sub-collection abbreviation, such as `"CGP"` or `"BP"`. Use `msigdbr_collections()` for the available options. |
| `category` | [![\[Deprecated\]](../help/figures/lifecycle-deprecated.svg)](https://lifecycle.r-lib.org/articles/stages.html#deprecated) use the `collection` argument |
| `subcategory` | [![\[Deprecated\]](../help/figures/lifecycle-deprecated.svg)](https://lifecycle.r-lib.org/articles/stages.html#deprecated) use the `subcollection` argument |

### Details

Historically, the MSigDB resource has been tailored to the analysis of human-specific datasets, with
gene sets exclusively aligned to the human genome. Starting with release 2022.1, MSigDB incorporated
a database of mouse-native gene sets and was split into human and mouse divisions ("Hs" and "Mm").
Each one is provided in the approved gene symbols of its respective species.

Mouse MSigDB includes gene sets curated from mouse-centric datasets and specified in native mouse
gene identifiers, eliminating the need for ortholog mapping.

### Value

A tibble (a data frame with class `tibble::tbl_df`) of gene sets with one gene per row.

### Examples

```r
# Get all human gene sets
gs <- msigdbr()
head(gs)

# Get all mouse gene sets
gs <- msigdbr(db_species = "MM", species = "Mus musculus")
head(gs)

# Get CGP (chemical and genetic perturbations) gene sets with genes mapped to rat orthologs
gs <- msigdbr(species = "Rattus norvegicus", collection = "C2", subcollection = "CGP")
head(gs)
```
