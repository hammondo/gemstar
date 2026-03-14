import { fetchJson } from "./http";

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface SampleItem {
  id: string;
  label: string;
}

export interface SampleResponse {
  items: SampleItem[];
  generatedAt: string;
}

export function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/api/health");
}

export function getSampleData(): Promise<SampleResponse> {
  return fetchJson<SampleResponse>("/api/sample");
}
