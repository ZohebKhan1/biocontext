import type { AgentEvent } from './loop.ts';
import type { EvidenceEnvelope } from '../tools/evidence.ts';

export type AgentResult = {
	answer: string;
	model: { provider: string; model: string };
	events: AgentEvent[];
	evidence: EvidenceEnvelope;
};
