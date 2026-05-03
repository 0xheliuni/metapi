export type ReconciliationStatus = 'matched' | 'warning' | 'mismatch' | 'ignored';

export type ReconciliationExplanation = {
  status: ReconciliationStatus;
  confidenceScore: number;
  codes: string[];
  text: string;
};

export function explainReconciliationResult(input: {
  modelFamily: string;
  downstreamBilledTokens: number;
  metapiObservedTokens: number;
  upstreamConsumedQuota: number;
  deltaCostUsd: number;
  hasUpstreamFacts: boolean;
  usedSnapshotInference: boolean;
}): ReconciliationExplanation {
  const codes: string[] = [];
  if (!input.hasUpstreamFacts) codes.push('UPSTREAM_SNAPSHOT_GAP');
  if (input.usedSnapshotInference) codes.push('SELF_LOG_USAGE_USED');
  if (input.modelFamily === 'other') codes.push('MODEL_UNMAPPED');
  if (input.downstreamBilledTokens <= 0 && input.metapiObservedTokens > 0) codes.push('OBSERVED_ONLY');
  if (input.downstreamBilledTokens > 0 && input.metapiObservedTokens <= 0) codes.push('DOWNSTREAM_ONLY');

  const tokenDelta = Math.abs(input.downstreamBilledTokens - input.metapiObservedTokens);
  const costDelta = Math.abs(input.deltaCostUsd);
  let status: ReconciliationStatus = 'matched';

  if (codes.length > 0) status = 'warning';
  if (tokenDelta >= 1000 || costDelta >= 1) status = 'mismatch';

  const confidenceScore = Math.max(0.1, Math.min(0.95, status === 'matched' ? 0.9 : status === 'warning' ? 0.6 : 0.35));
  const text = codes.length > 0
    ? `模型族 ${input.modelFamily} 存在 ${codes.join(' / ')}，当前结果属于解释性对账。`
    : `模型族 ${input.modelFamily} 的账本差异处于可接受范围。`;

  return { status, confidenceScore, codes, text };
}
