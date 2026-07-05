import { ENV } from "@config/env.config";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";

export interface FlowableTask {
  id: string;
  name: string;
  assignee?: string;
  processInstanceId: string;
  processDefinitionId?: string;
  candidateGroups?: string[];
  createTime?: string;
  [key: string]: unknown;
}

export interface FlowableProcessInstance {
  id: string;
  businessKey?: string;
  processDefinitionKey?: string;
  endTime?: string;
  deleteReason?: string;
  [key: string]: unknown;
}

@Injectable()
export class FlowableClientService {
  private readonly logger = new Logger(FlowableClientService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor() {
    this.baseUrl = ENV.FLOWABLE_REST_BASE_URL;
    const credentials = Buffer.from(`${ENV.FLOWABLE_SVC_USER}:${ENV.FLOWABLE_SVC_PASSWORD}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error(`Flowable ${method} ${path} -> ${response.status}: ${text}`);
      throw new InternalServerErrorException(`Flowable request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {} as T;
    }

    return response.json() as T;
  }

  async startProcessInstance(params: {
    processDefinitionKey: string;
    businessKey: string;
    variables: Record<string, unknown>;
  }): Promise<FlowableProcessInstance> {
    return this.request<FlowableProcessInstance>("POST", "/runtime/process-instances", {
      processDefinitionKey: params.processDefinitionKey,
      businessKey: params.businessKey,
      variables: Object.entries(params.variables).map(([name, value]) => ({ name, value })),
    });
  }

  async getTasksByAssignee(userId: string, page = 0, size = 20) {
    return this.request<{ data: FlowableTask[]; total: number }>(
      "GET",
      `/runtime/tasks?assignee=${encodeURIComponent(userId)}&start=${page * size}&size=${size}&sort=createTime&order=desc`,
    );
  }

  async getTasksByCandidateGroups(groups: string[], page = 0, size = 20) {
    if (!groups.length) return { data: [], total: 0 };
    const groupsParam = encodeURIComponent(groups.join(","));
    return this.request<{ data: FlowableTask[]; total: number }>(
      "GET",
      `/runtime/tasks?candidateGroups=${groupsParam}&unassigned=true&start=${page * size}&size=${size}`,
    );
  }

  async getTaskById(taskId: string): Promise<FlowableTask> {
    return this.request<FlowableTask>("GET", `/runtime/tasks/${taskId}`);
  }

  async completeTask(taskId: string, variables: Record<string, unknown>): Promise<void> {
    return this.request<void>("POST", `/runtime/tasks/${taskId}`, {
      action: "complete",
      variables: Object.entries(variables).map(([name, value]) => ({ name, value })),
    });
  }

  async claimTask(taskId: string, userId: string): Promise<void> {
    return this.request<void>("POST", `/runtime/tasks/${taskId}`, {
      action: "claim",
      assignee: userId,
    });
  }

  async getProcessInstance(processInstanceId: string): Promise<FlowableProcessInstance> {
    return this.request<FlowableProcessInstance>("GET", `/runtime/process-instances/${processInstanceId}`);
  }

  async getHistoricProcessInstance(processInstanceId: string): Promise<FlowableProcessInstance> {
    return this.request<FlowableProcessInstance>("GET", `/history/historic-process-instances/${processInstanceId}`);
  }

  async getProcessInstances(params: { page?: number; size?: number; processDefinitionKey?: string; businessKey?: string }) {
    const { page = 0, size = 20, processDefinitionKey, businessKey } = params;
    const qs = new URLSearchParams({ start: String(page * size), size: String(size) });
    if (processDefinitionKey) qs.set("processDefinitionKey", processDefinitionKey);
    if (businessKey) qs.set("businessKey", businessKey);
    return this.request<{ data: FlowableProcessInstance[]; total: number }>(`GET`, `/runtime/process-instances?${qs}`);
  }

  async deleteProcessInstance(processInstanceId: string, deleteReason = "Cancelled by user"): Promise<void> {
    return this.request<void>("DELETE", `/runtime/process-instances/${processInstanceId}?deleteReason=${encodeURIComponent(deleteReason)}`);
  }

  async getProcessDefinitions(params: { page?: number; size?: number; key?: string } = {}) {
    const { page = 0, size = 20, key } = params;
    const qs = new URLSearchParams({ start: String(page * size), size: String(size) });
    if (key) qs.set("key", key);
    return this.request<{ data: unknown[]; total: number }>("GET", `/repository/process-definitions?${qs}`);
  }

  async ping(): Promise<unknown> {
    return this.request<unknown>("GET", "/repository/process-definitions?size=1");
  }
}
