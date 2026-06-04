export interface ScaffoldConfig {
  framework: 'angular' | 'react';
  ci_platform: 'azure-devops' | 'github-actions' | 'jenkins' | 'none';
  openapi_spec?: string;
  scaffold_testids?: boolean;
  testid_convention?: string;
  provider?: 'azure' | 'deepseek';
  // Azure OpenAI
  azure_openai_endpoint?: string;
  azure_openai_deployment?: string;
  // DeepSeek
  deepseek_model?: string;
  critical_workflows: string[];
}

export interface DetectedRoute {
  path: string;
  isParameterized: boolean;
}

export interface DetectedHttpCall {
  method: string;
  url: string;
  file: string;
  isDynamic: boolean;
}

export interface DetectedComponent {
  name: string;
  file: string;
  selector?: string;
}

export interface ScanResult {
  framework: 'angular' | 'react';
  routes: DetectedRoute[];
  httpCalls: DetectedHttpCall[];
  components: DetectedComponent[];
  openApiSpec?: Record<string, unknown>;
  detectedPort: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  confidence?: number;
}

export interface GenerationResult {
  files: GeneratedFile[];
  summary: {
    mswConfidence?: number;
    smokeConfidence?: number;
    workflowConfidences: number[];
  };
}

export interface CliOptions {
  repo: string;
  dryRun: boolean;
  skipAi: boolean;
  verbose: boolean;
  force: boolean;
}
