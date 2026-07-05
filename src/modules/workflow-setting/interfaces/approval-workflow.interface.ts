export interface ApprovalWorkflow<TSubmitDto = unknown> {
  readonly processDefinitionKey: string;

  submit(dto: TSubmitDto, requesterId: string, idempotencyKey: string): Promise<{ id: string; processInstanceId?: string }>;

  finalizeByBusinessKey(businessKey: string, decision: string): Promise<void>;
}
