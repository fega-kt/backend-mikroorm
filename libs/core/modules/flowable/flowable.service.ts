import { ENV } from "@config/env.config";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import {
  FlowableDeployment,
  FlowableHistoricProcessInstance,
  FlowableProcessDefinition,
  FlowableProcessInstance,
  FlowableTask,
  FlowableVariableValue,
} from "./flowable.types";

interface FlowableVariable {
  name: string;
  value: FlowableVariableValue;
}

function toVariableList(variables?: Record<string, FlowableVariableValue>): FlowableVariable[] {
  return Object.entries(variables ?? {}).map(([name, value]) => ({ name, value }));
}

/** Thin client for the stock Flowable REST API (flowable-spring-boot-starter-rest) exposed by the
 *  `flowable` project — see D:\project\home\flowable\approval-flowable-nestjs-react-docs.md. No custom
 *  facade: real endpoints, HTTP Basic Auth with a fixed service account, plain (unwrapped) JSON bodies. */
@Injectable()
export class FlowableService {
  private readonly logger = new Logger(FlowableService.name);
  private readonly baseUrl = ENV.FLOWABLE_REST_BASE_URL;
  private readonly authHeader = `Basic ${Buffer.from(`${ENV.FLOWABLE_SVC_USER}:${ENV.FLOWABLE_SVC_PASSWORD}`).toString("base64")}`;

  private jsonHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: this.authHeader };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Flowable call failed [${init.method ?? "GET"} ${path}]: ${res.status} ${text}`);
      throw new InternalServerErrorException(`Flowable call failed: ${res.status}`);
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : undefined;
  }

  async startProcessInstance(
    processDefinitionKey: string,
    businessKey: string,
    variables?: Record<string, FlowableVariableValue>,
  ): Promise<FlowableProcessInstance> {
    return this.request<FlowableProcessInstance>("/runtime/process-instances", {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({ processDefinitionKey, businessKey, variables: toVariableList(variables) }),
    });
  }

  async getTasksByProcessInstance(processInstanceId: string): Promise<FlowableTask[]> {
    const params = new URLSearchParams({ processInstanceId });
    const body = await this.request<{ data: FlowableTask[] }>(`/runtime/tasks?${params.toString()}`, {
      headers: this.jsonHeaders(),
    });
    return body.data;
  }

  async completeTask(taskId: string, variables?: Record<string, FlowableVariableValue>): Promise<void> {
    await this.request<void>(`/runtime/tasks/${taskId}`, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({ action: "complete", variables: toVariableList(variables) }),
    });
  }

  /** Creates a standalone Flowable task, not tied to any process instance — used for review
   *  subtasks (advisory, doesn't affect the main BPMN flow). Stock Flowable REST supports this
   *  via a plain POST to /runtime/tasks (no processInstanceId in the body). */
  async createStandaloneTask(name: string, assignee: string): Promise<FlowableTask> {
    return this.request<FlowableTask>("/runtime/tasks", {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name, assignee }),
    });
  }

  async deleteProcessInstance(processInstanceId: string, deleteReason?: string): Promise<void> {
    const params = deleteReason ? `?deleteReason=${encodeURIComponent(deleteReason)}` : "";
    await this.request<void>(`/runtime/process-instances/${processInstanceId}${params}`, {
      method: "DELETE",
      headers: this.jsonHeaders(),
    });
  }

  async getHistoricProcessInstance(processInstanceId: string): Promise<FlowableHistoricProcessInstance> {
    return this.request<FlowableHistoricProcessInstance>(`/history/historic-process-instances/${processInstanceId}`, {
      headers: this.jsonHeaders(),
    });
  }

  async deploy(xml: Buffer, filename = "process.bpmn20.xml"): Promise<FlowableDeployment> {
    const form = new FormData();
    form.append("file", new Blob([xml], { type: "application/xml" }), filename);
    return this.request<FlowableDeployment>("/repository/deployments", {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: form,
    });
  }

  /** No deploymentId is ever persisted in our own DB (matches v5): the latest process definition for
   *  a key is always resolved on demand, so admins never reopen a stale pinned version. */
  async getLatestProcessDefinitionByKey(processDefinitionKey: string): Promise<FlowableProcessDefinition | null> {
    const params = new URLSearchParams({ key: processDefinitionKey, latest: "true" });
    const body = await this.request<{ data: FlowableProcessDefinition[] }>(`/repository/process-definitions?${params.toString()}`, {
      headers: this.jsonHeaders(),
    });
    return body.data[0] ?? null;
  }

  /** Raw BPMN XML content of a process definition — resolved via processDefinitionId (never a
   *  deploymentId), matching v5's editor flow (RepositoryService.getProcessModel(id)). */
  async getProcessDefinitionResourceXml(processDefinitionId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/repository/process-definitions/${processDefinitionId}/resourcedata`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Flowable resourcedata fetch failed for process definition ${processDefinitionId}: ${res.status} ${text}`);
      throw new InternalServerErrorException(`Flowable call failed: ${res.status}`);
    }
    return res.text();
  }
}
