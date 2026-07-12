export interface MarketplaceCapabilitySnapshot {
  permissionKeys: string[];
  capabilities: string[];
  scopes: string[];
  publicRouteExtensionIds: string[];
  adminPageHrefs: string[];
  apiPaths: string[];
  settingKeys: string[];
}

export interface MarketplaceCapabilityEscalation {
  field:
    | 'permissionKeys'
    | 'capabilities'
    | 'scopes'
    | 'publicRouteExtensionIds'
    | 'adminPageHrefs'
    | 'apiPaths'
    | 'settingKeys';
  added: string[];
  level: 'approval-required' | 'blocked';
  reason: string;
}

export interface MarketplaceCapabilityContractEvaluation {
  hasEscalation: boolean;
  escalations: MarketplaceCapabilityEscalation[];
  approvals: string[];
  blockers: string[];
  summary: string;
}
