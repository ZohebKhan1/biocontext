# Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2

Received 2014 May; Accepted 2014 Nov; Issue date 2014.

# Background

The rapid adoption of high-throughput sequencing (HTS) technologies for
genomic studies has resulted in a need for statistical methods to assess
quantitative differences between experiments. An important task here is
the analysis of RNA sequencing (RNA-seq) data with the aim of finding
genes that are differentially expressed across groups of samples. This
task is general: methods for it are typically also applicable for other
comparative HTS assays, including chromatin immunoprecipitation
sequencing, chromosome conformation capture, or counting observed taxa
in metagenomic studies.

Besides the need to account for the specifics of count data, such as
non-normality and a dependence of the variance on the mean, a core
challenge is the small number of samples in typical HTS experiments –
often as few as two or three replicates per condition. Inferential
methods that treat each gene separately suffer here from lack of power,
due to the high uncertainty of within-group variance estimates. In
high-throughput assays, this limitation can be overcome by pooling
information across genes, specifically, by exploiting assumptions about
the similarity of the variances of different genes measured in the same
experiment.

Many methods for differential expression analysis of RNA-seq data
perform such information sharing across genes for variance (or,
equivalently, dispersion) estimation. *edgeR* moderates the
dispersion estimate for each gene toward a common estimate across all
genes, or toward a local estimate from genes with similar expression
strength, using a weighted conditional likelihood. Our *DESeq* method
 detects and corrects dispersion estimates that are too low through
modeling of the dependence of the dispersion on the average expression
strength over all samples. *BBSeq* models the dispersion on the
mean, with the mean absolute deviation of dispersion estimates used to
reduce the influence of outliers. *DSS* uses a Bayesian approach
to provide an estimate for the dispersion for individual genes that
accounts for the heterogeneity of dispersion values for different genes.
*baySeq* and *ShrinkBayes* estimate priors for a Bayesian
model over all genes, and then provide posterior probabilities or false
discovery rates (FDRs) for differential expression.

The most common approach in the comparative analysis of transcriptomics
data is to test the null hypothesis that the logarithmic fold change
(LFC) between treatment and control for a gene’s expression is exactly
zero, i.e., that the gene is not at all affected by the treatment. Often
the goal of differential analysis is to produce a list of genes passing
multiple-test adjustment, ranked by *P* value. However, small changes,
even if statistically highly significant, might not be the most
interesting candidates for further investigation. Ranking by fold
change, on the other hand, is complicated by the noisiness of LFC
estimates for genes with low counts. Furthermore, the number of genes
called significantly differentially expressed depends as much on the
sample size and other aspects of experimental design as it does on the
biology of the experiment – and well-powered experiments often generate
an overwhelmingly long list of hits. We, therefore, developed a
statistical framework to facilitate gene ranking and visualization based
on stable estimation of effect sizes (LFCs), as well as testing of
differential expression with respect to user-defined thresholds of
biological significance.

Here we present *DESeq2*, a successor to our *DESeq* method.
*DESeq2* integrates methodological advances with several novel features
to facilitate a more quantitative analysis of comparative RNA-seq data
using shrinkage estimators for dispersion and fold change. We
demonstrate the advantages of *DESeq2*’s new features by describing a
number of applications possible with shrunken fold changes and their
estimates of standard error, including improved gene ranking and
visualization, hypothesis tests above and below a threshold, and the
regularized logarithm transformation for quality assessment and
clustering of overdispersed count data. We furthermore compare
*DESeq2*’s statistical power with existing tools, revealing that our
methodology has high sensitivity and precision, while controlling the
false positive rate. *DESeq2* is available as an R/Bioconductor
package.

# Results and discussion

## Model and normalization

The starting point of a *DESeq2* analysis is a count matrix *K* with one
row for each gene *i* and one column for each sample *j*. The matrix
entries *K*_{*ij*} indicate the number of sequencing reads that
have been unambiguously mapped to a gene in a sample. Note that although
we refer in this paper to counts of reads in genes, the methods
presented here can be applied as well to other kinds of HTS count data.
For each gene, we fit a generalized linear model (GLM) as
follows.

We model read counts *K*_{*ij*} as following a negative binomial
distribution (sometimes also called a gamma-Poisson distribution) with
mean *μ*_{*ij*} and dispersion *α*_{*i*}. The mean is
taken as a quantity *q*_{*ij*}, proportional to the
concentration of cDNA fragments from the gene in the sample, scaled by a
normalization factor *s*_{*ij*}, i.e.,
*μ*_{*ij*}=*s*_{*ij*}*q*_{*ij*}. For many
applications, the same constant *s*_{*j*} can be used for all
genes in a sample, which then accounts for differences in sequencing
depth between samples. To estimate these *size factors*, the *DESeq2*
package offers the median-of-ratios method already used in *DESeq*
. However, it can be advantageous to calculate gene-specific
normalization factors *s*_{*ij*} to account for further sources
of technical biases such as differing dependence on GC content, gene
length or the like, using published methods, and these can be
supplied instead.

We use GLMs with a logarithmic link,
$`\log\limits_{2}q_{\textit{ij}} = \sum\limits_{r}x_{\textit{jr}}\beta_{\textit{ir}}`$,
with design matrix elements *x*_{*jr*} and coefficients
*β*_{*ir*}. In the simplest case of a comparison between two
groups, such as treated and control samples, the design matrix elements
indicate whether a sample *j* is treated or not, and the GLM fit returns
coefficients indicating the overall expression strength of the gene and
the log _{2} fold change between treatment and control. The use
of linear models, however, provides the flexibility to also analyze more
complex designs, as is often useful in genomic studies.

## Empirical Bayes shrinkage for dispersion estimation

Within-group variability, i.e., the variability between replicates, is
modeled by the dispersion parameter *α*_{*i*}, which describes
the variance of counts via
$`\operatorname{Var}K_{\textit{ij}} = \mu_{\textit{ij}} + \alpha_{i}\mu_{\textit{ij}}^{2}`$.
Accurate estimation of the dispersion parameter *α*_{*i*} is
critical for the statistical inference of differential expression. For
studies with large sample sizes this is usually not a problem. For
controlled experiments, however, sample sizes tend to be smaller
(experimental designs with as little as two or three replicates are
common and reasonable), resulting in highly variable dispersion
estimates for each gene. If used directly, these noisy estimates would
compromise the accuracy of differential expression testing.

One sensible solution is to share information across genes. In *DESeq2*,
we assume that genes of similar average expression strength have similar
dispersion. We here explain the concepts of our approach using as
examples a dataset by Bottomly *et al.* with RNA-seq data for
mice of two different strains and a dataset by Pickrell *et al.*
with RNA-seq data for human lymphoblastoid cell lines. For the
mathematical details, see
Materials and methods.

We first treat each gene separately and estimate gene-wise dispersion
estimates (using maximum likelihood), which rely only on the data of
each individual gene (black dots in Figure
1). Next, we determine the
location parameter of the distribution of these estimates; to allow for
dependence on average expression strength, we fit a smooth curve, as
shown by the red line in Figure
1. This provides an accurate
estimate for the expected dispersion value for genes of a given
expression strength but does not represent deviations of individual
genes from this overall trend. We then shrink the gene-wise dispersion
estimates toward the values predicted by the curve to obtain final
dispersion values (blue arrow heads). We use an empirical Bayes approach
(Materials and methods), which
lets the strength of shrinkage depend (i) on an estimate of how close
true dispersion values tend to be to the fit and (ii) on the degrees of
freedom: as the sample size increases, the shrinkage decreases in
strength, and eventually becomes negligible. Our approach therefore
accounts for gene-specific variation to the extent that the data provide
this information, while the fitted curve aids estimation and testing in
less information-rich settings.

Our approach is similar to the one used by *DSS*, in that both
methods sequentially estimate a prior distribution for the true
dispersion values around the fit, and then provide the maximum *a
posteriori* (MAP) as the final estimate. It differs from the previous
implementation of *DESeq*, which used the maximum of the fitted curve
and the gene-wise dispersion estimate as the final estimate and tended
to overestimate the dispersions (Additional file
1: Figure S2). The approach
of *DESeq2* differs from that of *edgeR*, as *DESeq2* estimates
the width of the prior distribution from the data and therefore
automatically controls the amount of shrinkage based on the observed
properties of the data. In contrast, the default steps in *edgeR*
require a user-adjustable parameter, the *prior degrees of freedom*,
which weighs the contribution of the individual gene estimate and
*edgeR*’s dispersion fit.

Note that in Figure 1 a number
of genes with gene-wise dispersion estimates below the curve have their
final estimates raised substantially. The shrinkage procedure thereby
helps avoid potential false positives, which can result from
underestimates of dispersion. If, on the other hand, an individual
gene’s dispersion is far above the distribution of the gene-wise
dispersion estimates of other genes, then the shrinkage would lead to a
greatly reduced final estimate of dispersion. We reasoned that in many
cases, the reason for extraordinarily high dispersion of a gene is that
it does not obey our modeling assumptions; some genes may show much
higher variability than others for biological or technical reasons, even
though they have the same average expression levels. In these cases,
inference based on the shrunken dispersion estimates could lead to
undesirable false positive calls. *DESeq2* handles these cases by using
the gene-wise estimate instead of the shrunken estimate when the former
is more than 2 residual standard deviations above the curve.

## Empirical Bayes shrinkage for fold-change estimation

A common difficulty in the analysis of HTS data is the strong variance
of LFC estimates for genes with low read count. We demonstrate this
issue using the dataset by Bottomly *et al.*. As visualized in
Figure 2A, weakly expressed
genes seem to show much stronger differences between the compared mouse
strains than strongly expressed genes. This phenomenon, seen in most HTS
datasets, is a direct consequence of dealing with *count* data, in which
ratios are inherently noisier when counts are low. This
heteroskedasticity (variance of LFCs depending on mean count)
complicates downstream analysis and data interpretation, as it makes
effect sizes difficult to compare across the dynamic range of the data.

*DESeq2* overcomes this issue by shrinking LFC estimates toward zero in
a manner such that shrinkage is stronger when the available information
for a gene is low, which may be because counts are low, dispersion is
high or there are few degrees of freedom. We again employ an empirical
Bayes procedure: we first perform ordinary GLM fits to obtain
maximum-likelihood estimates (MLEs) for the LFCs and then fit a
zero-centered normal distribution to the observed distribution of MLEs
over all genes. This distribution is used as a prior on LFCs in a second
round of GLM fits, and the MAP estimates are kept as final estimates of
LFC. Furthermore, a standard error for each estimate is reported, which
is derived from the posterior’s curvature at its maximum (see
Materials and methods for
details). These shrunken LFCs and their standard errors are used in the
Wald tests for differential expression described in the next section.

The resulting MAP LFCs are biased toward zero in a manner that removes
the problem of exaggerated LFCs for low counts. As Figure
2B shows, the strongest LFCs are
no longer exhibited by genes with weakest expression. Rather, the
estimates are more evenly spread around zero, and for very weakly
expressed genes (with less than one read per sample on average), LFCs
hardly deviate from zero, reflecting that accurate LFC estimates are not
possible here.

The strength of shrinkage does not depend simply on the mean count, but
rather on the amount of information available for the fold change
estimation (as indicated by the observed Fisher information; see
Materials and methods). Two
genes with equal expression strength but different dispersions will
experience a different amount of shrinkage (Figure
2C,D). The shrinkage of LFC
estimates can be described as a bias-variance trade-off: for
genes with little information for LFC estimation, a reduction of the
strong variance is bought at the cost of accepting a bias toward zero,
and this can result in an overall reduction in mean squared error, e.g.,
when comparing to LFC estimates from a new dataset. Genes with high
information for LFC estimation will have, in our approach, LFCs with
both low bias and low variance. Furthermore, as the degrees of freedom
increase, and the experiment provides more information for LFC
estimation, the shrunken estimates will converge to the unshrunken
estimates. We note that other Bayesian efforts toward moderating fold
changes for RNA-seq include hierarchical models and the *GFOLD*
(or generalized fold change) tool, which uses a posterior
distribution of LFCs.

The shrunken MAP LFCs offer a more reproducible quantification of
transcriptional differences than standard MLE LFCs. To demonstrate this,
we split the Bottomly *et al.* samples equally into two groups, I and
II, such that each group contained a balanced split of the strains,
simulating a scenario where an experiment (samples in group I) is
performed, analyzed and reported, and then independently replicated
(samples in group II). Within each group, we estimated LFCs between the
strains and compared between groups I and II, using the MLE LFCs (Figure
3A) and using the MAP LFCs
(Figure 3B). Because the
shrinkage moves large LFCs that are not well supported by the data
toward zero, the agreement between the two independent sample groups
increases considerably. Therefore, shrunken fold-change estimates offer
a more reliable basis for quantitative conclusions than normal MLEs.

This makes shrunken LFCs also suitable for ranking genes, e.g., to
prioritize them for follow-up experiments. For example, if we sort the
genes in the two sample groups of Figure
3 by unshrunken LFC estimates,
and consider the 100 genes with the strongest up- or down-regulation in
group I, we find only 21 of these again among the top 100 up- or
down-regulated genes in group II. However, if we rank the genes by
shrunken LFC estimates, the overlap improves to 81 of 100 genes
(Additional file 1: Figure
S3).

A simpler often used method is to add a fixed number (pseudocount) to
all counts before forming ratios. However, this requires the choice of a
tuning parameter and only reacts to one of the sources of uncertainty,
low counts, but not to gene-specific dispersion differences or sample
size. We demonstrate this in the *Benchmarks* section below.

## Hypothesis tests for differential expression

After GLMs are fit for each gene, one may test whether each model
coefficient differs significantly from zero. *DESeq2* reports the
standard error for each shrunken LFC estimate, obtained from the
curvature of the coefficient’s posterior (dashed lines in Figure
2D) at its maximum. For
significance testing, *DESeq2* uses a Wald test: the shrunken estimate
of LFC is divided by its standard error, resulting in a *z*-statistic,
which is compared to a standard normal distribution. (See
Materials and methods for
details.) The Wald test allows testing of individual coefficients, or
contrasts of coefficients, without the need to fit a reduced model as
with the likelihood ratio test, though the likelihood ratio test is also
available as an option in *DESeq2*. The Wald test *P* values from the
subset of genes that pass an independent filtering step, described in
the next section, are adjusted for multiple testing using the procedure
of Benjamini and Hochberg.

## Automatic independent filtering

Due to the large number of tests performed in the analysis of RNA-seq
and other genome-wide experiments, the multiple testing problem needs to
be addressed. A popular objective is control or estimation of the FDR.
Multiple testing adjustment tends to be associated with a loss of power,
in the sense that the FDR for a set of genes is often higher than the
individual *P* values of these genes. However, the loss can be reduced
if genes that have little or no chance of being detected as
differentially expressed are omitted from the testing, provided that the
criterion for omission is independent of the test statistic under the
null hypothesis (see
Materials and methods).
*DESeq2* uses the average expression strength of each gene, across all
samples, as its filter criterion, and it omits all genes with mean
normalized counts below a filtering threshold from multiple testing
adjustment. *DESeq2* by default will choose a threshold that maximizes
the number of genes found at a user-specified target FDR. In Figures
2A,B and
3, genes found in this way to be
significant at an estimated FDR of 10% are depicted in red. Depending on
the distribution of the mean normalized counts, the resulting increase
in power can be substantial, sometimes making the difference in whether
or not any differentially expressed genes are detected.

## Hypothesis tests with thresholds on effect size

### Specifying minimum effect size

Most approaches to testing for differential expression, including the
default approach of *DESeq2*, test against the null hypothesis of *zero*
LFC. However, if any biological processes are genuinely affected by the
difference in experimental treatment, this null hypothesis implies that
the gene under consideration is *perfectly* decoupled from these
processes. Due to the high interconnectedness of cells’ regulatory
networks, this hypothesis is, in fact, implausible, and arguably wrong
for many if not most genes. Consequently, with sufficient sample size,
even genes with a very small but non-zero LFC will eventually be
detected as differentially expressed. A change should therefore be of
sufficient magnitude to be considered *biologically significant*. For
small-scale experiments, statistical significance is often a much
stricter requirement than biological significance, thereby relieving the
researcher from the need to decide on a threshold for biological
significance.

For well-powered experiments, however, a statistical test against the
conventional null hypothesis of zero LFC may report genes with
statistically significant changes that are so weak in effect strength
that they could be considered irrelevant or distracting. A common
procedure is to disregard genes whose estimated LFC *β*_{*ir*}
is below some threshold, \|*β*_{*ir*}\|≤*θ*. However, this
approach loses the benefit of an easily interpretable FDR, as the
reported *P* value and adjusted *P* value still correspond to the test
of *zero* LFC. It is therefore desirable to include the threshold in the
statistical testing procedure directly, i.e., not to filter post hoc on
a reported fold-change *estimate*, but rather to evaluate statistically
directly whether there is sufficient evidence that the LFC is above the
chosen threshold.

*DESeq2* offers tests for composite null hypotheses of the form
\|*β*_{*ir*}\|≤*θ*, where *β*_{*ir*} is the shrunken LFC
from the estimation procedure described above. (See
Materials and methods for
details.) Figure 4A demonstrates
how such a thresholded test gives rise to a curved decision boundary: to
reach significance, the estimated LFC has to exceed the specified
threshold by an amount that depends on the available information. We
note that related approaches to generate gene lists that satisfy both
statistical and biological significance criteria have been previously
discussed for microarray data and recently for sequencing data

### Specifying maximum effect size

Sometimes, a researcher is interested in finding genes that are not, or
only very weakly, affected by the treatment or experimental condition.
This amounts to a setting similar to the one just discussed, but the
roles of the null and alternative hypotheses are swapped. We are here
asking for evidence of the effect being weak, not for evidence of the
effect being zero, because the latter question is rarely tractable. The
meaning of *weak* needs to be quantified for the biological question at
hand by choosing a suitable threshold *θ* for the LFC. For such
analyses, *DESeq2* offers a test of the composite null hypothesis
\|*β*_{*ir*}\|≥*θ*, which will report genes as significant for
which there is evidence that their LFC is weaker than *θ*. Figure
4B shows the outcome of such a
test. For genes with very low read count, even an estimate of zero LFC
is not significant, as the large uncertainty of the estimate does not
allow us to exclude that the gene may in truth be more than weakly
affected by the experimental condition. Note the lack of LFC shrinkage:
to find genes with weak differential expression, *DESeq2* requires that
the LFC shrinkage has been disabled. This is because the zero-centered
prior used for LFC shrinkage embodies a *prior* belief that LFCs tend to
be small, and hence is inappropriate here.

## Detection of count outliers

Parametric methods for detecting differential expression can have
gene-wise estimates of LFC overly influenced by individual outliers that
do not fit the distributional assumptions of the model. An
example of such an outlier would be a gene with single-digit counts for
all samples, except one sample with a count in the thousands. As the aim
of differential expression analysis is typically to find *consistently*
up- or down-regulated genes, it is useful to consider diagnostics for
detecting individual observations that overly influence the LFC estimate
and *P* value for a gene. A standard outlier diagnostic is Cook’s
distance, which is defined within each gene for each sample as
the scaled distance that the coefficient vector,
$`{\overset{\rightarrow}{\beta}}_{i}`$, of a linear model or GLM would
move if the sample were removed and the model refit.

*DESeq2* flags, for each gene, those samples that have a Cook’s distance
greater than the.99 quantile of the *F*(*p*,*m*−*p*) distribution,
where *p* is the number of model parameters including the intercept, and
*m* is the number of samples. The use of the *F* distribution is
motivated by the heuristic reasoning that removing a single sample
should not move the vector $`{\overset{\rightarrow}{\beta}}_{i}`$
outside of a 99% confidence region around
$`{\overset{\rightarrow}{\beta}}_{i}`$ fit using all the samples.
However, if there are two or fewer replicates for a condition, these
samples do not contribute to outlier detection, as there are
insufficient replicates to determine outlier status.

How should one deal with flagged outliers? In an experiment with many
replicates, discarding the outlier and proceeding with the remaining
data might make best use of the available data. In a small experiment
with few samples, however, the presence of an outlier can impair
inference regarding the affected gene, and merely ignoring the outlier
may even be considered data cherry-picking – and therefore, it is more
prudent to exclude the whole gene from downstream analysis.

Hence, *DESeq2* offers two possible responses to flagged outliers. By
default, outliers in conditions with six or fewer replicates cause the
whole gene to be flagged and removed from subsequent analysis, including
*P* value adjustment for multiple testing. For conditions that contain
seven or more replicates, *DESeq2* replaces the outlier counts with an
imputed value, namely the trimmed mean over all samples, scaled by the
size factor, and then re-estimates the dispersion, LFCs and *P* values
for these genes. As the outlier is replaced with the value predicted by
the null hypothesis of no differential expression, this is a more
conservative choice than simply omitting the outlier. When there are
many degrees of freedom, the second approach avoids discarding genes
that might contain true differential expression.

Additional file 1: Figure S4
displays the outlier replacement procedure for a single gene in a seven
by seven comparison of the Bottomly *et al.* dataset. While the
original fitted means are heavily influenced by a single sample with a
large count, the corrected LFCs provide a better fit to the majority of
the samples.

## Regularized logarithm transformation

For certain analyses, it is useful to transform data to render them
homoskedastic. As an example, consider the task of assessing sample
similarities in an unsupervised manner using a clustering or ordination
algorithm. For RNA-seq data, the problem of heteroskedasticity arises:
if the data are given to such an algorithm on the original count scale,
the result will be dominated by highly expressed, highly variable genes;
if logarithm-transformed data are used, undue weight will be given to
weakly expressed genes, which show exaggerated LFCs, as discussed above.
Therefore, we use the shrinkage approach of *DESeq2* to implement a
*regularized logarithm* transformation (rlog), which behaves similarly
to a log2 transformation for genes with high counts, while shrinking
together the values for different samples for genes with low counts. It
therefore avoids a commonly observed property of the standard logarithm
transformation, the spreading apart of data for genes with low counts,
where random noise is likely to dominate any biologically meaningful
signal. When we consider the variance of each gene, computed across
samples, these variances are stabilized – i.e., approximately the same,
or homoskedastic – after the rlog transformation, while they would
otherwise strongly depend on the mean counts. It thus facilitates
multivariate visualization and ordinations such as clustering or
principal component analysis that tend to work best when the variables
have similar dynamic range. Note that while the rlog transformation
builds upon on our LFC shrinkage approach, it is distinct from and not
part of the statistical inference procedure for differential expression
analysis described above, which employs the raw counts, not transformed
data.

The rlog transformation is calculated by fitting for each gene a GLM
with a baseline expression (i.e., intercept only) and, computing for
each sample, shrunken LFCs with respect to the baseline, using the same
empirical Bayes procedure as before
(Materials and methods). Here,
however, the sample covariate information (e.g. treatment or control) is
not used, so that all samples are treated equally. The rlog
transformation accounts for variation in sequencing depth across samples
as it represents the logarithm of *q*_{*ij*} after accounting
for the size factors *s*_{*ij*}. This is in contrast to the
variance-stabilizing transformation (VST) for overdispersed counts
introduced in *DESeq*: while the VST is also effective at
stabilizing variance, it does not directly take into account differences
in size factors; and in datasets with large variation in sequencing
depth (dynamic range of size factors $`\gtrsim`$<!-- -->4) we observed
undesirable artifacts in the performance of the VST. A disadvantage of
the rlog transformation with respect to the VST is, however, that the
ordering of genes within a sample will change if neighboring genes
undergo shrinkage of different strength. As with the VST, the value of
rlog(*K*_{*ij*}) for large counts is approximately equal to
log2(*K*_{*ij*}/*s*_{*j*}). Both the rlog transformation
and the VST are provided in the *DESeq2* package.

We demonstrate the use of the rlog transformation on the RNA-seq dataset
of Hammer *et al.*, wherein RNA was sequenced from the dorsal
root ganglion of rats that had undergone spinal nerve ligation and
controls, at 2 weeks and at 2 months after the ligation. The count
matrix for this dataset was downloaded from the ReCount online resource
. This dataset offers more subtle differences between conditions
than the Bottomly *et al.* dataset. Figure
5 provides diagnostic plots of
the normalized counts under the ordinary logarithm with a pseudocount of
1 and the rlog transformation, showing that the rlog both stabilizes the
variance through the range of the mean of counts and helps to find
meaningful patterns in the data.

## Gene-level analysis

We here present *DESeq2* for the analysis of per-gene counts, i.e., the
total number of reads that can be uniquely assigned to a gene. In
contrast, several algorithms work with probabilistic
assignments of reads to transcripts, where multiple, overlapping
transcripts can originate from each gene. It has been noted that the
total read count approach can result in false detection of differential
expression when in fact only transcript isoform lengths change, and even
in a wrong sign of LFCs in extreme cases. However, in our
benchmark, discussed in the following section, we found that LFC sign
disagreements between total read count and
probabilistic-assignment-based methods were rare for genes that were
differentially expressed according to either method (Additional file
1: Figure S5). Furthermore,
if estimates for average transcript length are available for the
conditions, these can be incorporated into the *DESeq2* framework as
gene- and sample-specific normalization factors. In addition, the
approach used in *DESeq2* can be extended to isoform-specific analysis,
either through generalized linear modeling at the exon level with a
gene-specific mean as in the *DEXSeq* package or through counting
evidence for alternative isoforms in splice graphs. In fact,
the latest release version of *DEXSeq* now uses *DESeq2* as its
inferential engine and so offers shrinkage estimation of dispersion and
effect sizes for an exon-level analysis, too.

## Comparative benchmarks

To assess how well *DESeq2* performs for standard analyses in comparison
to other current methods, we used a combination of simulations and real
data. The negative-binomial-based approaches compared were *DESeq (old)*
, *edgeR*, *edgeR* with the robust option, *DSS*
 and *EBSeq*. Other methods compared were the *voom*
normalization method followed by linear modeling using the *limma*
package and the *SAMseq* permutation method of the *samr* package
. For the benchmarks using real data, the *Cuffdiff 2*
method of the Cufflinks suite was included. For version numbers of the
software used, see Additional file
1: Table S3. For all
algorithms returning *P* values, the *P* values from genes with non-zero
sum of read counts across samples were adjusted using the
Benjamini–Hochberg procedure.

### Benchmarks through simulation

**Sensitivity and precision** We simulated datasets of,000 genes with
negative binomial distributed counts. To simulate data with realistic
moments, the mean and dispersions were drawn from the joint distribution
of means and gene-wise dispersion estimates from the Pickrell *et al.*
data, fitting only an intercept term. These datasets were of varying
total sample size (*m*∈{6,8,10,20}), and the samples were split into two
equal-sized groups; 80% of the simulated genes had no true differential
expression, while for 20% of the genes, true fold changes of, 3 and 4
were used to generate counts across the two groups, with the direction
of fold change chosen randomly. The simulated differentially expressed
genes were chosen uniformly at random among all the genes, throughout
the range of mean counts. MA-plots of the true fold changes used in the
simulation and the observed fold changes induced by the simulation for
one of the simulation settings are shown in Additional file
1: Figure S6.

Algorithms’ performance in the simulation benchmark was assessed by
their sensitivity and precision. The sensitivity was calculated as the
fraction of genes with adjusted *P* value <0.1 among the genes with
true differences between group means. The precision was calculated as
the fraction of genes with true differences between group means among
those with adjusted *P* value <0.1. The sensitivity is plotted over
1−precision, or the FDR, in Figure
6. *DESeq2*, and also *edgeR*,
often had the highest sensitivity of the algorithms that controlled
type-I error in the sense that the actual FDR was at or below.1, the
threshold for adjusted *P* values used for calling differentially
expressed genes. *DESeq2* had higher sensitivity compared to the other
algorithms, particularly for small fold change (2 or 3), as was also
found in benchmarks performed by Zhou *et al.*. For larger sample
sizes and larger fold changes the performance of the various algorithms
was more consistent.

The overly conservative calling of the old *DESeq* tool can be observed,
with reduced sensitivity compared to the other algorithms and an actual
FDR less than the nominal value of.1. We note that *EBSeq* version
1.4.0 by default removes low-count genes – whose 75% quantile of
normalized counts is less than ten – before calling differential
expression. The sensitivity of algorithms on the simulated data across a
range of the mean of counts are more closely compared in Additional file
1: Figure S9.

**Outlier sensitivity** We used simulations to compare the sensitivity
and specificity of *DESeq2*’s outlier handling approach to that of
*edgeR*, which was recently added to the software and published while
this manuscript was under review. *edgeR* now includes an optional
method to handle outliers by iteratively refitting the GLM after
down-weighting potential outlier counts. The simulations,
summarized in Additional file
1: Figure S10, indicated
that both approaches to outliers nearly recover the performance on an
outlier-free dataset, though *edgeR-robust* had slightly higher actual
than nominal FDR, as seen in Additional file
1: Figure S11.

**Precision of fold change estimates** We benchmarked the *DESeq2*
approach of using an empirical prior to achieve shrinkage of LFC
estimates against two competing approaches: the *GFOLD* method, which
can analyze experiments without replication and can also handle
experiments with replicates, and the *edgeR* package, which provides a
pseudocount-based shrinkage termed *predictive LFCs*. Results are
summarized in Additional file
1: Figures S12–S16. *DESeq2*
had consistently low root-mean-square error and mean absolute error
across a range of sample sizes and models for a distribution of true
LFCs. *GFOLD* had similarly low error to *DESeq2* over all genes;
however, when focusing on differentially expressed genes, it performed
worse for larger sample sizes. *edgeR* with default settings had
similarly low error to *DESeq2* when focusing only on the differentially
expressed genes, but had higher error over all genes.

**Clustering** We compared the performance of the rlog transformation
against other methods of transformation or distance calculation in the
recovery of simulated clusters. The adjusted Rand index was used
to compare a hierarchical clustering based on various distances with the
true cluster membership. We tested the Euclidean distance for normalized
counts, logarithm of normalized counts plus a pseudocount of,
rlog-transformed counts and VST counts. In addition we compared these
Euclidean distances with the Poisson distance implemented in the
*PoiClaClu* package, and a distance implemented internally in the
*plotMDS* function of *edgeR* (though not the default distance, which is
similar to the logarithm of normalized counts). The results, shown in
Additional file 1: Figure
S17, revealed that when the size factors were equal for all samples, the
Poisson distance and the Euclidean distance of rlog-transformed or VST
counts outperformed other methods. However, when the size factors were
not equal across samples, the rlog approach generally outperformed the
other methods. Finally, we note that the rlog transformation provides
normalized data, which can be used for a variety of applications, of
which distance calculation is one.

### Benchmark for RNA sequencing data

While simulation is useful to verify how well an algorithm behaves with
idealized theoretical data, and hence can verify that the algorithm
performs as expected under its own assumptions, simulations cannot
inform us how well the theory fits reality. With RNA-seq data, there is
the complication of not knowing fully or directly the underlying truth;
however, we can work around this limitation by using more indirect
inference, explained below.

In the following benchmarks, we considered three performance metrics for
differential expression calling: the false positive rate (or 1 minus the
specificity), sensitivity and precision. We can obtain meaningful
estimates of specificity from looking at datasets where we believe all
genes fall under the null hypothesis of no differential expression
. Sensitivity and precision are more difficult to estimate, as
they require independent knowledge of those genes that are
differentially expressed. To circumvent this problem, we used
experimental reproducibility on independent samples (though from the
same dataset) as a proxy. We used a dataset with large numbers of
replicates in both of two groups, where we expect that truly
differentially expressed genes exist. We repeatedly split this dataset
into an evaluation set and a larger verification set, and compared the
calls from the evaluation set with the calls from the verification set,
which were taken as truth. It is important to keep in mind that the
calls from the verification set are only an approximation of the true
differential state, and the approximation error has a systematic and a
stochastic component. The stochastic error becomes small once the sample
size of the verification set is large enough. For the systematic errors,
our benchmark assumes that these affect all algorithms more or less
equally and do not markedly change the ranking of the algorithms.

**False positive rate** To evaluate the false positive rate of the
algorithms, we considered mock comparisons from a dataset with many
samples and no known condition dividing the samples into distinct
groups. We used the RNA-seq data of Pickrell *et al.* for
lymphoblastoid cell lines derived from unrelated Nigerian individuals.
We chose a set of 26 RNA-seq samples of the same read length (46 base
pairs) from male individuals. We randomly drew without replacement ten
samples from the set to compare five against five, and this process was
repeated 30 times. We estimated the false positive rate associated with
a critical value of.01 by dividing the number of *P* values less than
0.01 by the total number of tests; genes with zero sum of read counts
across samples were excluded. The results over the 30 replications,
summarized in Figure,
indicated that all algorithms generally controlled the number of false
positives. *DESeq (old)* and *Cuffdiff 2* appeared overly conservative
in this analysis, not using up their type-I error budget.

**Sensitivity** To obtain an impression of the sensitivity of the
algorithms, we considered the Bottomly *et al.* dataset, which
contains ten and eleven replicates of two different, genetically
homogeneous mice strains. This allowed for a split of three vs three for
the evaluation set and seven vs eight for the verification set, which
were balanced across the three experimental batches. Random splits were
replicated 30 times. Batch information was not provided to the *DESeq
(old)*, *DESeq2*, *DSS*, *edgeR* or *voom* algorithms, which can
accommodate complex experimental designs, to have comparable calls
across all algorithms.

We rotated though each algorithm to determine the calls of the
verification set. For a given algorithm’s verification set calls, we
tested the evaluation set calls of every algorithm. We used this
approach rather than a consensus-based method, as we did not want to
favor or disfavor any particular algorithm or group of algorithms.
Sensitivity was calculated as in the simulation benchmark, now with true
differential expression defined by an adjusted *P* value <0.1 in the
larger verification set, as diagrammed in Additional file
1: Figure S18. Figure
8 displays the estimates of
sensitivity for each algorithm pair.

The ranking of algorithms was generally consistent regardless of which
algorithm was chosen to determine calls in the verification set.
*DESeq2* had comparable sensitivity to *edgeR* and *voom* though less
than *DSS*. The median sensitivity estimates were typically between.2
and.4 for all algorithms. That all algorithms had relatively low
median sensitivity can be explained by the small sample size of the
evaluation set and the fact that increasing the sample size in the
verification set increases power. It was expected that the
permutation-based *SAMseq* method would rarely produce adjusted *P*
value <0.1 in the evaluation set, because the three vs three comparison
does not enable enough permutations.

**Precision** Another important consideration from the perspective of an
investigator is the precision, or fraction of true positives in the set
of genes which pass the adjusted *P* value threshold. This can also be
reported as 1−FDR. Again, ‘true’ differential expression was defined by
an adjusted *P* value <0.1 in the larger verification set. The
estimates of precision are displayed in Figure
9, where we can see that
*DESeq2* often had the second highest median precision, behind *DESeq
(old)*. We can also see that algorithms with higher median sensitivity,
e.g., *DSS*, were generally associated here with lower median precision.
The rankings differed significantly when *Cuffdiff 2* was used to
determine the verification set calls. This is likely due to the
additional steps *Cuffdiff 2* performed to deconvolve changes in
isoform-level abundance from gene-level abundance, which apparently came
at the cost of lower precision when compared against its own
verification set calls.

To compare the sensitivity and precision results further, we calculated
the precision of algorithms along a grid of nominal adjusted *P* values
(Additional file 1: Figure
S19). We then found the nominal adjusted *P* value for each algorithm,
which resulted in a median actual precision of.9 (FDR = 0.1). Having
thus calibrated each algorithm to a target FDR, we evaluated the
sensitivity of calling, as shown in Additional file
1: Figure S20. As expected,
here the algorithms performed more similarly to each other. This
analysis revealed that, for a given target precision, *DESeq2* often was
among the top algorithms by median sensitivity, though the variability
across random replicates was larger than the differences between
algorithms.

The absolute number of calls for the evaluation and verification sets
can be seen in Additional file
1: Figures S21 and S22,
which mostly matched the order seen in the sensitivity plot of Figure
8. Additional file
1: Figures S23 and S24
provide heat maps and clustering based on the Jaccard index of calls for
one replicate of the evaluation and verification sets, indicating a
large overlap of calls across the different algorithms.

In summary, the benchmarking tests showed that *DESeq2* effectively
controlled type-I errors, maintaining a median false positive rate just
below the chosen critical value in a mock comparison of groups of
samples randomly chosen from a larger pool. For both simulation and
analysis of real data, *DESeq2* often achieved the highest sensitivity
of those algorithms that controlled the FDR.

# Conclusions

*DESeq2* offers a comprehensive and general solution for gene-level
analysis of RNA-seq data. Shrinkage estimators substantially improve the
stability and reproducibility of analysis results compared to
maximum-likelihood-based solutions. Empirical Bayes priors provide
automatic control of the amount of shrinkage based on the amount of
information for the estimated quantity available in the data. This
allows *DESeq2* to offer consistent performance over a large range of
data types and makes it applicable for small studies with few replicates
as well as for large observational studies. *DESeq2*’s heuristics for
outlier detection help to recognize genes for which the modeling
assumptions are unsuitable and so avoids type-I errors caused by these.
The embedding of these strategies in the framework of GLMs enables the
treatment of both simple and complex designs.

A critical advance is the shrinkage estimator for fold changes for
differential expression analysis, which offers a sound and statistically
well-founded solution to the practically relevant problem of comparing
fold change across the wide dynamic range of RNA-seq experiments. This
is of value for many downstream analysis tasks, including the ranking of
genes for follow-up studies and association of fold changes with other
variables of interest. In addition, the rlog transformation, which
implements shrinkage of fold changes on a per-sample basis, facilitates
visualization of differences, for example in heat maps, and enables the
application of a wide range of techniques that require homoskedastic
input data, including machine-learning or ordination techniques such as
principal component analysis and clustering.

*DESeq2* hence offers to practitioners a wide set of features with
state-of-the-art inferential power. Its use cases are not limited to
RNA-seq data or other transcriptomics assays; rather, many kinds of
high-throughput count data can be used. Other areas for which *DESeq* or
*DESeq2* have been used include chromatin immunoprecipitation sequencing
assays (e.g.,; see also the *DiffBind* package ),
barcode-based assays (e.g., ), metagenomics data (e.g., ),
ribosome profiling and CRISPR/Cas-library assays. Finally,
the *DESeq2* package is integrated well in the Bioconductor
infrastructure and comes with extensive documentation, including
a vignette that demonstrates a complete analysis step by step and
discusses advanced use cases.

# Materials and methods

A summary of the notation used in the following section is provided in
Additional file 1: Table S1.

## Model and normalization

The read count *K*_{*ij*} for gene *i* in sample *j* is
described with a GLM of the negative binomial family with a logarithmic
link:

` math
\begin{matrix}
K_{\textit{ij}} & {\sim \text{NB}\left( \text{mean} = \mu_{\textit{ij}},\text{dispersion} =
\alpha_{i} \right)} \\
\mu_{\textit{ij}} & {= s_{\textit{ij}}q_{\textit{ij}}} \\
\end{matrix}
\log q_{\textit{ij}} = \sum\limits_{r}x_{\textit{jr}}\beta_{\textit{ir}}.
```

For notational simplicity, the equations here use the natural logarithm
as the link function, though the *DESeq2* software reports estimated
model coefficients and their estimated standard errors on the log2
scale.

By default, the normalization constants *s*_{*ij*} are
considered constant within a sample,
*s*_{*ij*}=*s*_{*j*}, and are estimated with the
median-of-ratios method previously described and used in *DESeq*
and *DEXSeq*:

` math
s_{j} = \underset{i:\; K_{i}^{\text{R}} \neq 0}{\text{median}}\;\frac{K_{\textit{ij}}}{K_{i}^{\text{R}}}\quad\text{with}\quad K_{i}^{\text{R}} = \left( {\prod\limits_{j = 1}^{m}K_{\textit{ij}}} \right)^{1/m}.
```

Alternatively, the user can supply normalization constants
*s*_{*ij*} calculated using other methods (e.g., using *cqn*
 or *EDASeq* ), which may differ from gene to gene.

## Expanded design matrices

For consistency with our software’s documentation, in the following text
we will use the terminology of the *R* statistical language. In linear
modeling, a categorical variable or *factor* can take on two or more
values or *levels*. In standard design matrices, one of the values is
chosen as a reference value or *base level* and absorbed into the
intercept. In standard GLMs, the choice of base level does not influence
the values of contrasts (LFCs). This, however, is no longer the case in
our approach using ridge-regression-like shrinkage on the coefficients
(described below), when factors with more than two levels are present in
the design matrix, because the base level will not undergo shrinkage
while the other levels do.

To recover the desirable symmetry between all levels, *DESeq2* uses
*expanded design matrices*, which include an indicator variable for
*each* level of each factor, in addition to an intercept column (i.e.,
none of the levels is absorbed into the intercept). While such a design
matrix no longer has full rank, a unique solution exists because the
zero-centered prior distribution (see below) provides regularization.
For dispersion estimation and for estimating the width of the LFC prior,
standard design matrices are used.

## Contrasts

Contrasts between levels and standard errors of such contrasts can be
calculated as they would in the standard design matrix case, i.e.,
using:

` math
\beta_{i}^{c} = \overset{\rightarrow}{c};^{t}\overset{\rightarrow}{\beta_{i}}
\text{SE}\left( \beta_{i}^{c} \right) =
\sqrt{\overset{\rightarrow}{c};^{t}\Sigma_{i}\overset{\rightarrow}{c}},
```

where $`\overset{\rightarrow}{c}`$ represents a numeric contrast, e.g.,
1 and −1 specifying the numerator and denominator of a simple two-level
contrast, and
$`\Sigma_{i} = \text{Cov}\left( {\overset{\rightarrow}{\beta}}_{i} \right)`$,
defined below.

## Estimation of dispersions

We assume the dispersion parameter *α*_{*i*} follows a
log-normal prior distribution that is centered around a trend that
depends on the gene’s mean normalized read count:

` math
\log\alpha_{i} \sim N\;\left( {\log\alpha_{\text{tr}}\left( {\overline{\mu}}_{i} \right),\;\sigma_{\text{d}}^{2}} \right).
```

Here, *α*_{tr} is a function of the gene’s mean normalized
count,

` math
{\overline{\mu}}_{i} = \frac{1}{m}\sum\limits_{j}\frac{K_{\textit{ij}}}{s_{\textit{ij}}}.
```

It describes the mean-dependent expectation of the prior.
*σ*_{d} is the width of the prior, a hyperparameter describing
how much the individual genes’ true dispersions scatter around the
trend. For the trend function, we use the same parametrization as we
used for *DEXSeq*, namely,

` math
\alpha_{\text{tr}}\left( \overline{\mu} \right) = \frac{a_{1}}{\overline{\mu}} + \alpha_{0}.
```

We get final dispersion estimates from this model in three steps, which
implement a computationally fast approximation to a full empirical Bayes
treatment. We first use the count data for each gene separately to get
preliminary gene-wise dispersion estimates $`\alpha_{i}^{\text{gw}}`$ by
maximum-likelihood estimation. Then, we fit the dispersion trend
*α*_{tr}. Finally, we combine the likelihood with the trended
prior to get maximum *a posteriori* (MAP) values as final dispersion
estimates. Details for the three steps follow.

**Gene-wise dispersion estimates** To get a gene-wise dispersion
estimate for a gene *i*, we start by fitting a negative binomial GLM
without an LFC prior for the design matrix *X* to the gene’s count data.
This GLM uses a rough method-of-moments estimate of dispersion, based on
the within-group variances and means. The initial GLM is necessary to
obtain an initial set of fitted values,
$`{\hat{\mu}}_{\textit{ij}}^{0}`$. We then maximize the Cox–Reid
adjusted likelihood of the dispersion, conditioned on the fitted values
$`{\hat{\mu}}_{\textit{ij}}^{0}`$ from the initial fit, to obtain the
gene-wise estimate $`\alpha_{i}^{\text{gw}}`$, i.e.,

` math
\alpha_{i}^{\text{gw}} = \underset{\alpha}{\text{arg max}}\mspace{500mu}\ell_{\text{CR}}\left(
{\alpha;{\overset{\rightarrow}{\mu}}_{\textit{i} \cdot}^{0},{\overset{\rightarrow}{K}}_{\textit{i}
\cdot}} \right)
```

with

` math
\begin{matrix}
{\ell_{\text{CR}}\left( \alpha;\overset{\rightarrow}{\mu},\overset{\rightarrow}{K} \right)} & {= \ell(\alpha) - \frac{1}{2}\log\left( {\det\left( {X^{t}\textit{WX}} \right)} \right)} \\
{\ell(\alpha)} & {= \sum\limits_{j}\log f_{\text{NB}}\left( K_{j};\mu_{j},\alpha \right),}
\end{matrix}
```

where *f*_{NB}(*k*;*μ*,*α*) is the probability mass function of
the negative binomial distribution with mean *μ* and dispersion *α*, and
the second term provides the Cox–Reid bias adjustment. This
adjustment, first used in the context of dispersion estimation for SAGE
data and then for HTS data in *edgeR*, corrects for the
negative bias of dispersion estimates from using the MLEs for the fitted
values $`{\hat{\mu}}_{\textit{ij}}^{0}`$ (analogous to Bessel’s
correction in the usual sample variance formula; for details, see
, Section.6). It is formed from the Fisher information for the
fitted values, which is here calculated as det(*X*^{*t*}*WX*),
where *W* is the diagonal weight matrix from the standard iteratively
reweighted least-squares algorithm. As the GLM’s link function is
*g*(*μ*)= log(*μ*) and its variance function is
*V*(*μ*;*α*)=*μ*+*αμ*^{2}, the elements of the diagonal matrix
*W*_{*i*} are given by:

` math
w_{\textit{jj}} = \frac{1}{g'\left( \mu_{j} \right)^{2}V\left( \mu_{j} \right)} = \frac{1}{1/\mu_{j}
+ \alpha}.
```

The optimization in Equation
(7) is performed on the
scale of log*α* using a backtracking line search with accepted proposals
that satisfy Armijo conditions.

**Dispersion trend** A parametric curve of the form
(6) is fit by
regressing the gene-wise dispersion estimates $`\alpha_{i}^{\text{gw}}`$
onto the means of the normalized counts, $`{\overline{\mu}}_{i}`$. The
sampling distribution of the gene-wise dispersion estimate around the
true value *α*_{*i*} can be highly skewed, and therefore we do
not use ordinary least-squares regression but rather gamma-family GLM
regression. Furthermore, dispersion outliers could skew the fit and
hence a scheme to exclude such outliers is used.

The hyperparameters *a*_{1} and *α*_{0} of
(6) are obtained by
iteratively fitting a gamma-family GLM. At each iteration, genes with a
ratio of dispersion to fitted value outside the range
\[10^{−4},15\] are left out until the sum of squared LFCs of the
new coefficients over the old coefficients is less than 10^{−6}
(same approach as in *DEXSeq* ).

The parametrization
is based on reports by us and others of decreasing dependence of
dispersion on the mean in many datasets. Some caution is
warranted to disentangle true underlying dependence from effects of
estimation bias that can create a perceived dependence of the dispersion
on the mean. Consider a negative binomial distributed random variable
with expectation *μ* and dispersion *α*. Its variance
*v*=*μ*+*αμ*^{2} has two components,
*v*=*v*_{P}+*v*_{D}, the Poisson component
*v*_{P}=*μ* independent of *α*, and the overdispersion component
*v*_{D}=*αμ*^{2}. When *μ* is small, *μ*≲1/*α* (vertical
lines in Additional file 1:
Figure S1), the Poisson component dominates, in the sense that
$`v_{\text{P}}/v_{\text{D}} = 1/({\alpha\mu}) \gtrsim 1`$, and the
observed data provide little information on the value of *α*. Therefore
the sampling variance of an estimator for *α* will be large when
*μ*≲1/*α*, which leads to the appearance of bias. For simplicity, we
have stated the above argument without regard to the influence of the
size factors, *s*_{*j*}, on the value of *μ*. This is
permissible because, by construction, the geometric mean of our size
factors is close to, and hence, the mean across samples of the
unnormalized read counts, $`\frac{1}{m}\sum\limits_{j}K_{\textit{ij}}`$,
and the mean of the normalized read counts,
$`\frac{1}{m}\sum\limits_{j}K_{\textit{ij}}/s_{j}`$, will be roughly the
same.

This phenomenon may give rise to an apparent dependence of *α* on *μ*.
It is possible that the shape of the dispersion-mean fit for the
Bottomly data (Figure 1A) can be
explained in that manner: the asymptotic dispersion is
*α*_{0}≈0.01, and the non-zero slope of the mean-dispersion plot
is limited to the range of mean counts up to around, the reciprocal
of *α*_{0}. However, overestimation of *α* in that low-count
range has little effect on inference, as in that range the variance *v*
is anyway dominated by the *α*-independent Poisson component
*v*_{P}. The situation is different for the Pickrell data: here,
a dependence of dispersion on mean was observed for counts clearly above
the reciprocal of the asymptotic dispersion *α*_{0} (Figure
1B), and hence is not due merely
to estimation bias. Simulations (shown in Additional file
1: Figure S25) confirmed
that the observed joint distribution of estimated dispersions and means
is not compatible with a single, constant dispersion. Therefore, the
parametrization is
a flexible and mildly conservative modeling choice: it is able to pick
up dispersion-mean dependence if it is present, while it can lead to a
minor loss of power in the low-count range due to a tendency to
overestimate dispersion there.

**Dispersion prior** As also observed by Wu *et al.*, a log-normal
prior fits the observed dispersion distribution for typical RNA-seq
datasets. We solve the computational difficulty of working with a
non-conjugate prior using the following argument: the logarithmic
residuals from the trend fit,
$`\log\underset{i}{\overset{\text{gw}}{\alpha}} - \log\alpha_{\text{tr}}\left( {\overline{\mu}}_{i}
\right)`$,
arise from two contributions, namely the scatter of the true logarithmic
dispersions around the trend, given by the prior with variance
$`\sigma_{\text{d}}^{2}`$, and the sampling distribution of the
logarithm of the dispersion estimator, with variance
$`\sigma_{\text{lde}}^{2}`$. The sampling distribution of a dispersion
estimator is approximately a scaled *χ*^{2} distribution with
*m*−*p* degrees of freedom, with *m* the number of samples and *p* the
number of coefficients. The variance of the logarithm of a
$`\chi_{f}^{2}`$-distributed random variable is given by the
trigamma function *ψ*_{1},

` math
\operatorname{Var}\log X^{2} = \psi_{1}(f/2)\quad\text{for}\quad X^{2} \sim \underset{f}{\overset{2}{\chi}}.
```

Therefore,
$`\sigma_{\text{lde}}^{2} \approx \psi_{1}\left( (m - p)/2 \right)`$,
i.e., the sampling variance of the logarithm of a variance or dispersion
estimator is approximately constant across genes and depends only on the
degrees of freedom of the model.

Additional file 1: Table S2
compares this approximation for the variance of logarithmic dispersion
estimates with the variance of logarithmic Cox–Reid adjusted dispersion
estimates for simulated negative binomial data, over a combination of
different sample sizes, number of parameters and dispersion values used
to create the simulated data. The approximation is close to the sample
variance for various typical values of *m*, *p* and *α*.

Therefore, the prior variance $`\sigma_{\text{d}}^{2}`$ is obtained by
subtracting the expected sampling variance from an estimate of the
variance of the logarithmic residuals, $`s_{\text{lr}}^{2}`$:

` math
\sigma_{\text{d}}^{2} = \max\left\{ {\underset{\text{lr}}{\overset{2}{s}} - \psi_{1}\left( (m - p)/2
\right),;; 0.25} \right\}.
```

The prior variance $`\sigma_{\text{d}}^{2}`$ is thresholded at a minimal
value of.25 so that the dispersion estimates are not shrunk entirely
to $`\alpha_{\text{tr}}\left( {\overline{\mu}}_{i} \right)`$ if the
variance of the logarithmic residuals is less than the expected sampling
variance.

To avoid inflation of $`\sigma_{\text{d}}^{2}`$ due to dispersion
outliers (i.e., genes not well captured by this prior; see below), we
use a robust estimator for the standard deviation *s*_{lr} of
the logarithmic residuals,

` math
s_{\text{lr}} = \underset{i}{\text{mad}}\left( {\log\underset{i}{\overset{\text{gw}}{\alpha}} - \log\alpha_{\text{tr}}\left( {\overline{\mu}}_{i} \right)} \right),
```

where mad stands for the median absolute deviation, divided as usual by
the scaling factor *Φ*^{−1}(3/4).

**Three or less residuals degrees of freedom** When there are three or
less residual degrees of freedom (number of samples minus number of
parameters to estimate), the estimation of the prior variance
$`\sigma_{\text{d}}^{2}`$ using the observed variance of logarithmic
residuals $`s_{\text{lr}}^{2}`$ tends to underestimate
$`\sigma_{\text{d}}^{2}`$. In this case, we instead estimate the prior
variance through simulation. We match the distribution of logarithmic
residuals to a density of simulated logarithmic residuals. These are the
logarithm of $`\chi_{m - p}^{2}`$-distributed random variables added to
$`N\left( 0,\sigma_{\text{d}}^{2} \right)`$ random variables to account
for the spread due to the prior. The simulated distribution is shifted
by − log(*m*−*p*) to account for the scaling of the *χ*^{2}
distribution. We repeat the simulation over a grid of values for
$`\sigma_{\text{d}}^{2}`$, and select the value that minimizes the
Kullback–Leibler divergence from the observed density of logarithmic
residuals to the simulated density.

**Final dispersion estimate** We form a logarithmic posterior for the
dispersion from the Cox–Reid adjusted logarithmic likelihood
(7) and the logarithmic
prior and use its
maximum (i.e., the MAP value) as the final estimate of the dispersion,

` math
\alpha_{i}^{\text{MAP}} = \underset{\alpha}{\text{arg max}};\left( {\ell_{\text{CR}}\left(
{\alpha;{\overset{\rightarrow}{\mu}}_{\textit{i} \cdot}^{0},{\overset{\rightarrow}{K}}_{\textit{i}
\cdot}} \right) + \Lambda_{i}(\alpha)} \right),
```

where

` math
\Lambda_{i}(\alpha) = \frac{- \left( {\log\alpha - \log\alpha_{\text{tr}}\left( {\overline{\mu}}_{i} \right)} \right)^{2}}{2\sigma_{\text{d}}^{2}},
```

is, up to an additive constant, the logarithm of the density of prior
(5). Again, a
backtracking line search is used to perform the optimization.

**Dispersion outliers** For some genes, the gene-wise estimate
$`\alpha_{i}^{\text{gw}}`$ can be so far above the prior expectation
$`\alpha_{\text{tr}}\left( {\overline{\mu}}_{i} \right)`$ that it would
be unreasonable to assume that the prior is suitable for the gene. If
the dispersion estimate for such genes were down-moderated toward the
fitted trend, this might lead to false positives. Therefore, we use the
heuristic of considering a gene as a dispersion outlier, if the residual
from the trend fit is more than two standard deviations of logarithmic
residuals, *s*_{lr} (see Equation
(8)), above the fit,
i.e., if

` math
\log\underset{i}{\overset{\text{gw}}{\alpha}} > \log\alpha_{\text{tr}}\left( {\overline{\mu}}_{i}
\right) + 2s_{\text{lr}}.
```

For such genes, the gene-wise estimate $`\alpha_{i}^{\text{gw}}`$ is not
shrunk toward the trended prior mean. Instead of the MAP value
$`\alpha_{i}^{\text{MAP}}`$, we use the gene-wise estimate
$`\alpha_{i}^{\text{gw}}`$ as a final dispersion value in the subsequent
steps. In addition, the iterative fitting procedure for the parametric
dispersion trend described above avoids that such dispersion outliers
influence the prior mean.

## Shrinkage estimation of logarithmic fold changes

To incorporate empirical Bayes shrinkage of LFCs, we postulate a
zero-centered normal prior for the coefficients *β*_{*ir*} of
model that
represent LFCs (i.e., typically, all coefficients except for the
intercept *β*_{*i*0}):

` math
\beta_{\textit{ir}} \sim N\;\left( {0,\sigma_{r}^{2}} \right).
```

As was observed with differential expression analysis using microarrays,
genes with low intensity values tend to suffer from a small
signal-to-noise ratio. Alternative estimators can be found that are more
stable than the standard calculation of fold change as the ratio of
average observed values for each condition. *DESeq2*’s
approach can be seen as an extension of these approaches for stable
estimation of gene-expression fold changes to count data.

**Empirical prior estimate** To obtain values for the empirical prior
widths *σ*_{*r*} for the model coefficients, we again
approximate a full empirical Bayes approach, as with the estimation of
dispersion prior, though here we do not subtract the expected sampling
variance from the observed variance of maximum likelihood estimates. The
estimate of the LFC prior width is calculated as follows. We use the
standard iteratively reweighted least-squares algorithm for each
gene’s model, Equations
(1) and
(2), to get MLEs for
the coefficients $`\beta_{\textit{ir}}^{\text{MLE}}`$. We then fit, for
each column *r* of the design matrix (except for the intercept), a
zero-centered normal distribution to the empirical distribution of MLE
fold change estimates
$`{\overset{\rightarrow}{\beta}}_{r}^{\text{MLE}}`$.

To make the fit robust against outliers with very high absolute LFC
values, we use quantile matching: the width *σ*_{*r*} is chosen
such that the (1−*p*) empirical quantile of the absolute value of the
observed LFCs, $`{\overset{\rightarrow}{\beta}}_{r}^{\text{MLE}}`$,
matches the (1−*p*/2) theoretical quantile of the prior,
$`N\left( 0,\sigma_{r}^{2} \right)`$, where *p* is set by default to
0.05. If we write the theoretical upper quantile of a normal
distribution as *Q*_{*N*}(1−*p*) and the empirical upper
quantile of the MLE LFCs as $`Q_{|\beta_{r}|}(1 - p)`$, then the prior
width is calculated as:

` math
\sigma_{r} = \frac{Q_{|\beta_{r}|}(1 - p)}{Q_{N}(1 - p/2)}.
```

To ensure that the prior width *σ*_{*r*} will be independent of
the choice of base level, the estimates from the quantile matching
procedure are averaged for each factor over all possible contrasts of
factor levels. When determining the empirical upper quantile, extreme
LFC values
($`\left| \beta_{\textit{ir}}^{\text{MLE}} \right| > \log; 10`$, or
10 on the base 2 scale) are excluded.

**Final estimate of logarithmic fold changes** The logarithmic posterior
for the vector, $`{\overset{\rightarrow}{\beta}}_{i}`$, of model
coefficients *β*_{*ir*} for gene *i* is the sum of the
logarithmic likelihood of the GLM
(2) and the logarithm
of the prior density
(10), and its maximum
yields the final MAP coefficient estimates:

` math
{\overset{\rightarrow}{\beta}}_{i} = \underset{\overset{\rightarrow}{\beta}}{\text{arg max}}\left( {\sum\limits_{j}\log f_{\text{NB}}\left( {K_{\textit{ij}};\mu_{j}\left( \overset{\rightarrow}{\beta} \right),\alpha_{i}} \right) + \Lambda\left( \overset{\rightarrow}{\beta} \right)} \right),
```

where

` math
\mu_{j}\left( \overset{\rightarrow}{\beta} \right) =
s_{\textit{ij}}e^{\sum\limits_{r}x_{\textit{jr}}\beta_{r}},\quad\Lambda\left(
\overset{\rightarrow}{\beta} \right) = \sum\limits_{r}\frac{- \beta_{r}^{2}}{2\sigma_{r}^{2}},
```

and *α*_{*i*} is the final dispersion estimate for gene *i*,
i.e., $`\alpha_{i} = \alpha_{i}^{\text{MAP}}`$, except for dispersion
outliers, where $`\alpha_{i} = \alpha_{i}^{\text{gw}}`$.

The term *Λ*(*β*), i.e., the logarithm of the density of the normal
prior (up to an additive constant), can be read as a ridge penalty term,
and therefore, we perform the optimization using the *iteratively
reweighted ridge regression algorithm*, also known as *weighted
updates*. Specifically, the updates for a given gene are of the
form

` math
\left. \overset{\rightarrow}{\beta}\leftarrow\left( {X^{t}\textit{WX} + \overset{\rightarrow}{\lambda}I} \right)^{- 1}X^{t}W\overset{\rightarrow}{z}, \right.
```

with $`\lambda_{r} = 1/\sigma_{r}^{2}`$ and

` math
z_{j} = \log\frac{\mu_{j}}{s_{j}} + \frac{K_{j} - \mu_{j}}{\mu_{j}},
```

where the current fitted values
$`\mu_{j} = s_{j}e^{\sum\limits_{r}x_{\textit{jr}}\beta_{r}}`$ are
computed from the current estimates $`\overset{\rightarrow}{\beta}`$ in
each iteration.

**Fisher information.** The effect of the zero-centered normal prior can
be understood as shrinking the MAP LFC estimates based on the amount of
information the experiment provides for this coefficient, and we briefly
elaborate on this here. Specifically, for a given gene *i*, the
shrinkage for an LFC *β*_{*ir*} depends on the *observed Fisher
information*, given by

` math
\mathcal{J}_{m}\left( {\hat{\beta}}_{\textit{ir}} \right) = - \left\lbrack {\frac{\partial^{2}}{\partial\beta_{\textit{ir}}^{2}}\ell\left( {{\overset{\rightarrow}{\beta}}_{i};\overset{\rightarrow}{K_{i}},\alpha_{i}} \right)} \right\rbrack_{\beta_{\textit{ir}} = {\hat{\beta}}_{\textit{ir}}},
```

where
$`\ell\left( {{\overset{\rightarrow}{\beta}}_{i};\overset{\rightarrow}{K_{i}},\alpha_{i}} \right)`$
is the logarithm of the likelihood, and partial derivatives are taken
with respect to LFC *β*_{*ir*}. For a negative binomial GLM, the
observed Fisher information, or peakedness of the logarithm of the
profile likelihood, is influenced by a number of factors including the
degrees of freedom, the estimated mean counts *μ*_{*ij*}, and
the gene’s dispersion estimate *α*_{*i*}. The prior influences
the MAP estimate when the density of the likelihood and the prior are
multiplied to calculate the posterior. Genes with low estimated mean
values *μ*_{*ij*} or high dispersion estimates *α*_{*i*}
have flatter profile likelihoods, as do datasets with few residual
degrees of freedom, and therefore in these cases the zero-centered prior
pulls the MAP estimate from a high-uncertainty MLE closer toward zero.

## Wald test

The Wald test compares the beta estimate *β*_{*ir*} divided by
its estimated standard error SE(*β*_{*ir*}) to a standard normal
distribution. The estimated standard errors are the square root of the
diagonal elements of the estimated covariance matrix, *Σ*_{*i*},
for the coefficients, i.e.,
$`\operatorname{SE}\left( \beta_{\textit{ir}} \right) = \sqrt{\Sigma_{i,\textit{rr}}}`$.
Contrasts of coefficients are tested similarly by forming a Wald
statistics using
and. We use the
following formula for the coefficient covariance matrix for a GLM with
normal prior on coefficients:

` math
\mspace{-2520mu}\Sigma_{i} = \operatorname{Cov}\left( {\overset{\rightarrow}{\beta}}_{i} \right) =
\left( X^{t}\textit{WX} + \overset{\rightarrow}{\lambda}I \right)^{- 1}\left( X^{t}\textit{WX}
\right)\left( X^{t}\textit{WX} + \overset{\rightarrow}{\lambda}I \right)^{- 1}.
```

The tail integrals of the standard normal distribution are multiplied by
2 to achieve a two-tailed test. The Wald test *P* values from the subset
of genes that pass the independent filtering step are adjusted for
multiple testing using the procedure of Benjamini and Hochberg.

## Independent filtering

Independent filtering does not compromise type-I error control as long
as the distribution of the test statistic is marginally independent of
the filter statistic *under the null hypothesis*, and we argue in
the following that this is the case in our application. The filter
statistic in *DESeq2* is the mean of normalized counts for a gene, while
the test statistic is *p*, the *P* value from the Wald test. We first
consider the case where the size factors are equal and where the
gene-wise dispersion estimates are used for each gene, i.e. without
dispersion shrinkage. The distribution family for the negative binomial
is parameterized by *θ*=(*μ*,*α*). Aside from discreteness of *p* due to
low counts, for a given *μ*, the distribution of *p* is Uniform
under the null hypothesis, so *p* is an ancillary statistic. The sample
mean of counts for gene *i*, $`{\overline{K}}_{i}`$, is boundedly
complete sufficient for *μ*. Then from Basu’s theorem,
$`{\overline{K}}_{i}`$ and *p* are independent.

While for very low counts, one can observe discreteness and
non-uniformity of *p* under the null hypothesis, *DESeq2* does not use
the distribution of *p* in its estimation procedure – for example,
*DESeq2* does not estimate the proportion of null genes using the
distribution of *p* – so this kind of dependence of *p* on *μ* does not
lead to increased type-I error.

If the size factors are not equal across samples, but not correlated
with condition, conditioning on the mean of *normalized* counts should
also provide uniformly distributed *p* as with conditioning on the mean
of counts, $`{\overline{K}}_{i}`$. We may consider a pathological case
where the size factors are perfectly confounded with condition, in which
case, even under the null hypothesis, genes with low mean count would
have non-uniform distribution of *p*, as one condition could have
positive counts and the other condition often zero counts. This could
lead to non-uniformity of *p* under the null hypothesis; however, such a
pathological case would pose problems for many statistical tests of
differences in mean.

We used simulation to demonstrate that the independence of the null
distribution of the test statistic from the filter statistic still holds
for dispersion shrinkage. Additional file
1: Figure S26 displays
marginal null distributions of *p* across the range of mean normalized
counts. Despite spikes in the distribution for the genes with the lowest
mean counts due to discreteness of the data, these densities were nearly
uniform across the range of average expression strength.

## Composite null hypotheses

*DESeq2* offers tests for composite null hypotheses of the form
$`\left. \mathcal{H}_{0}: \middle| \beta_{\textit{ir}} \middle| \leq \theta \right.`$
to find genes whose LFC significantly exceeds a threshold *θ*>0. The
composite null hypothesis is replaced by two simple null hypotheses:
$`\mathcal{H}_{0a}:\beta_{\textit{ir}} = \theta`$ and
$`\mathcal{H}_{0b}:\beta_{\textit{ir}} = - \theta`$. Two-tailed *P*
values are generated by integrating a normal distribution centered on
*θ* with standard deviation SE(*β*_{*ir*}) from
\|*β*_{*ir*}\| toward *∞*. The value of the integral is then
multiplied by 2 and thresholded at. This procedure controls type-I
error even when *β*_{*ir*}=±*θ*, and is equivalent to the
standard *DESeq2P* value when *θ*=0.

Conversely, when searching for genes whose absolute LFC is significantly
below a threshold, i.e., when testing the null hypothesis
$`\left. \mathcal{H}_{0}: \middle| \beta_{\textit{ir}} \middle| \geq \theta \right.`$,
the *P* value is constructed as the maximum of two one-sided tests of
the simple null hypotheses:
$`\mathcal{H}_{0a}:\beta_{\textit{ir}} = \theta`$ and
$`\mathcal{H}_{0b}:\beta_{\textit{ir}} = - \theta`$. The one-sided *P*
values are generated by integrating a normal distribution centered on
*θ* with standard deviation SE(*β*_{*ir*}) from
*β*_{*ir*} toward −*∞*, and integrating a normal distribution
centered on −*θ* with standard deviation SE(*β*_{*ir*}) from
*β*_{*ir*} toward *∞*.

Note that while a zero-centered prior on LFCs is consistent with testing
the null hypothesis of small LFCs, it should not be used when testing
the null hypothesis of large LFCs, because the prior would then favor
the alternative hypothesis. *DESeq2* requires that no prior has been
used when testing the null hypothesis of large LFCs, so that the data
alone must provide evidence against the null hypothesis.

## Interactions

Two exceptions to the default *DESeq2* LFC estimation steps are used for
experimental designs with interaction terms. First, when any interaction
terms are included in the design, the LFC prior width for main effect
terms is not estimated from the data, but set to a wide value
($`\sigma_{r}^{2} = \left( \log \right)^{2}; 1000`$, or 1000 on the
base 2 scale). This ensures that shrinkage of main effect terms will not
result in false positive calls of significance for interactions. Second,
when interaction terms are included and all factors have two levels,
then standard design matrices are used rather than expanded model
matrices, such that only a single term is used to test the null
hypothesis that a combination of two effects is merely additive in the
logarithmic scale.

## Regularized logarithm

The rlog transformation is calculated as follows. The experimental
design matrix *X* is substituted with a design matrix with an indicator
variable for every sample in addition to an intercept column. A model as
described in Equations
(1) and
(2) is fit with a
zero-centered normal prior on the non-intercept terms and using the
fitted dispersion values
$`\alpha_{\text{tr}}\left( \overline{\mu} \right)`$, which capture the
overall variance-mean dependence of the dataset. The true experimental
design matrix *X* is then only used in estimating the variance-mean
trend over all genes. For unsupervised analyses, for instance sample
quality assessment, it is desirable that the experimental design has no
influence on the transformation, and hence *DESeq2* by default ignores
the design matrix and re-estimates the dispersions treating all samples
as replicates, i.e., it uses *blind* dispersion estimation. The
rlog-transformed values are the fitted values,

` math
\text{rlog}\left( K_{\textit{ij}} \right) \equiv \log\limits_{2}q_{\textit{ij}} = \beta_{i0} + \beta_{\textit{ij}},
```

where *β*_{*ij*} is the shrunken LFC on the base 2 scale for the
*j*th sample. The variance of the prior is set using a similar approach
as taken with differential expression, by matching a zero-centered
normal distribution to observed LFCs. First a matrix of LFCs is
calculated by taking the logarithm (base 2) of the normalized counts
plus a pseudocount of $`\frac{1}{2}`$ for each sample divided by the
mean of normalized counts plus a pseudocount of $`\frac{1}{2}`$. The
pseudocount of $`\frac{1}{2}`$ allows for calculation of the logarithmic
ratio for all genes, and has little effect on the estimate of the
variance of the prior or the final rlog transformation. This matrix of
LFCs then represents the common-scale logarithmic ratio of each sample
to the fitted value using only an intercept. The prior variance is found
by matching the.5% quantile of a zero-centered normal distribution to
the 95% quantile of the absolute values in the LFC matrix.

## Cook’s distance for outlier detection

The MLE of $`{\overset{\rightarrow}{\beta}}_{i}`$ is used for
calculating Cook’s distance. Considering a gene *i* and sample *j*,
Cook’s distance for GLMs is given by:

` math
D_{\textit{ij}} = \frac{R_{\textit{ij}}^{2}}{\tau p}\frac{h_{\textit{jj}}}{\left( 1 -
h_{\textit{jj}} \right)^{2}},
```

where *R*_{*ij*} is the Pearson residual of sample *j*, *τ* is
an overdispersion parameter (in the negative binomial GLM, *τ* is set to
1), *p* is the number of parameters including the intercept, and
*h*_{*jj*} is the *j*th diagonal element of the hat matrix *H*:

` math
H = W^{1/2}X\left( X^{t}\textit{WX} \right)^{- 1}X^{t}W^{1/2}.
```

Pearson residuals *R*_{*ij*} are calculated as

` math
R_{\textit{ij}} = \frac{\left( K_{\textit{ij}} - \mu_{\textit{ij}} \right)}{\sqrt{V\left(
\mu_{\textit{ij}} \right)}},
```

where *μ*_{*ij*} is estimated by the negative binomial GLM
without the LFC prior, and using the variance function
*V*(*μ*)=*μ*+*αμ*^{2}. A method-of-moments estimate
$`\alpha_{i}^{\text{rob}}`$, using a robust estimator of variance
$`s_{i,\text{rob}}^{2}`$ to provide robustness against outliers, is used
here:

` math
\alpha_{i}^{\text{rob}} = \max\left( {\frac{\underset{i,\text{rob}}{\overset{2}{s}} - {\overline{\mu}}_{i}}{\underset{i}{\overset{2}{\overline{\mu}}}},0} \right).
```

## R/Bioconductor package

*DESeq2* is implemented as a package for the R statistical environment
and is available as part of the Bioconductor project. The
count matrix and metadata, including the gene model and sample
information, are stored in an S4 class derived from the
*SummarizedExperiment* class of the *GenomicRanges* package.
*SummarizedExperiment* objects containing count matrices can be easily
generated using the *summarizeOverlaps* function of the
*GenomicAlignments* package. This workflow automatically stores
the gene model as metadata and additionally other information such as
the genome and gene annotation versions. Other methods to obtain count
matrices include the *htseq-count* script and the Bioconductor
packages *easyRNASeq* and *featureCount*.

The *DESeq2* package comes with a detailed vignette, which works through
a number of example differential expression analyses on real datasets,
and the use of the rlog transformation for quality assessment and
visualization. A single function, called *DESeq*, is used to run the
default analysis, while lower-level functions are also available for
advanced users.

## Read alignment for the Bottomly *et al.* and Pickrell *et al.* datasets

Reads were aligned using the TopHat2 aligner, and assigned to
genes using the *summarizeOverlaps* function of the *GenomicRanges*
package. The sequence read archive fastq files of the Pickrell
*et al.* dataset (accession number \[SRA:SRP001540\]) were
aligned to the *Homo sapiens* reference sequence GRCh37 downloaded in
March 2013 from Illumina iGenomes. Reads were counted in the genes
defined by the Ensembl GTF file, release, contained in the Illumina
iGenome. The sequence read archive fastq files of the Bottomly *et al.*
 dataset (accession number \[SRA:SRP004777\]) were aligned to the
*Mus musculus* reference sequence NCBIM37 downloaded in March 2013 from
Illumina iGenomes. Reads were counted in the genes defined by the
Ensembl GTF file, release, contained in the Illumina iGenome.

## Reproducible code

Sweave vignettes for reproducing all figures and tables in this paper,
including data objects for the experiments mentioned, and code for
aligning reads and for benchmarking, can be found in a package
*DESeq2paper*.

# Abbreviations

# Footnotes

# Contributor Information
