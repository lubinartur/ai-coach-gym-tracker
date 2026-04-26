export type DecisionTraceEntry = {
  engine: string;
  entity: string;
  decision: string;
  reasons: string[];
  score?: number;
};

export type DecisionTrace = {
  traceId: string;
  entries: DecisionTraceEntry[];
};

