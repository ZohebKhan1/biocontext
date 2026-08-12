import { describe, expect, it } from 'bun:test';

import { BASE_PROMPT, buildSystemPrompt } from './prompt.ts';

const occurrences = (needle: RegExp) => BASE_PROMPT.match(needle)?.length ?? 0;

describe('agent prompt', () => {
	it('defines efficient scoped retrieval and concise evidence-backed output', () => {
		expect(BASE_PROMPT).toContain('Start with one search using the complete question');
		expect(BASE_PROMPT).toContain('Answer the question that was asked');
		expect(BASE_PROMPT).toContain('Before finalizing, audit every material claim');
		expect(BASE_PROMPT).toContain('every explicitly named package');
		expect(BASE_PROMPT).toContain('every material requirement is supported');
		expect(BASE_PROMPT).toContain('Match the source to the claim');
		expect(BASE_PROMPT).toContain('release-sensitive claims');
		expect(BASE_PROMPT).toContain('truncated search excerpts');
		expect(BASE_PROMPT).toContain('one compact decision table');
		expect(BASE_PROMPT).toContain('research memo');
		expect(BASE_PROMPT).toContain('stop/continue recommendation');
		expect(BASE_PROMPT).toContain('separate Recommendation, Summary');
		expect(BASE_PROMPT).toContain('one short target per API');
		expect(BASE_PROMPT).toContain('read_many');
		expect(BASE_PROMPT).toContain('1–12-span calls');
		expect(BASE_PROMPT).toContain('Issue evidence only for exact inclusive ranges');
		expect(BASE_PROMPT).toContain('Use only IDs returned by evidence');
		expect(BASE_PROMPT).toContain('Issue evidence before drafting');
		expect(BASE_PROMPT).toContain('uncited drafts are discarded');
		expect(BASE_PROMPT).not.toContain('1,500–2,500 words');
		expect(BASE_PROMPT).not.toContain('doom loop');
		expect(BASE_PROMPT).not.toContain('real code examples');
	});

	it('budgets retrieval and reuses inspected lines instead of re-reading', () => {
		expect(BASE_PROMPT).toContain('at most one focused follow-up search or grep');
		expect(BASE_PROMPT).toContain('Batch ranges needing inspection');
		expect(BASE_PROMPT).toContain('as few 1–12-span calls as possible');
		expect(BASE_PROMPT).toContain('evidence_ready=true');
		expect(BASE_PROMPT).toContain('compacted-read placeholder');
		expect(BASE_PROMPT).toContain('instead of re-reading');
	});

	it('uses pinned-version precedence for historical NEWS entries', () => {
		expect(BASE_PROMPT).toContain('In newest-first NEWS');
		expect(BASE_PROMPT).toContain('newest applicable entry supersedes older historical rules');
	});

	it('forbids the restatement that inflated earlier answers', () => {
		expect(BASE_PROMPT).toContain('no closing summary paragraph');
		expect(BASE_PROMPT).toContain('never restate a conclusion already given under a heading');
		expect(BASE_PROMPT).toContain('Prefer 450–550 words');
		expect(BASE_PROMPT).toContain('never expose virtual mount prefixes');
	});

	it('drops the dead Sources instruction the harness overrides', () => {
		// finalizeEvidenceAnswer strips any drafted Sources block and appends its own,
		// so instructing the model about one only spent tokens.
		expect(BASE_PROMPT).not.toContain('bibliography');
		expect(BASE_PROMPT).not.toContain('separate Sources');
	});

	it('states each recurring rule once rather than restating it across sections', () => {
		expect(occurrences(/never invent|do not invent/giu)).toBe(1);
		expect(occurrences(/insufficient evidence|does not settle a claim/giu)).toBe(1);
		expect(occurrences(/\bStart with one search\b/giu)).toBe(1);
		// Guards against drifting back toward the ~4.3k-character prompt that stated
		// abstention five times, scope three times, and brevity three times.
		expect(BASE_PROMPT.length).toBeLessThan(3_250);
	});

	it('appends the concrete query scope without altering it', () => {
		const instructions =
			'<query_scope mode="single_package"><tool_root>/DESeq2</tool_root></query_scope>';
		const prompt = buildSystemPrompt(instructions);
		expect(prompt).toContain(instructions);
		expect(prompt.indexOf('<answer_contract>')).toBeLessThan(prompt.indexOf(instructions));
	});
});
