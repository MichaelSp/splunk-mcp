export interface SplunkConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  token?: string;
  scheme: string;
  verifySSL: boolean;
}

export interface SplunkSearchResult {
  [key: string]: any;
}

export interface SplunkIndex {
  name: string;
  totalEventCount: string;
  currentDBSizeMB: string;
  maxTotalDataSizeMB: string;
  minTime: string;
  maxTime: string;
}

export interface SplunkUser {
  username: string;
  real_name: string;
  email: string;
  roles: string[];
  capabilities: string[];
  default_app: string;
  type: string;
}

export interface KVStoreCollection {
  name: string;
  app: string;
  fields: string[];
  accelerated_fields: string[];
  record_count: number;
}

export interface SavedSearch {
  name: string;
  description: string;
  search: string;
}

export interface SplunkApp {
  name: string;
  label: string;
  version: string;
}

export interface IndexesAndSourcetypes {
  indexes: string[];
  sourcetypes: {
    [index: string]: Array<{
      sourcetype: string;
      count: string;
    }>;
  };
  metadata: {
    total_indexes: number;
    total_sourcetypes: number;
    search_time_range: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}
