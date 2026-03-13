export type HubMode = "managed" | "private";

export interface HubConfig {
  mode: HubMode;
  networkId: string;
  directoryUrl: string;
  substrateUrl: string;
  operatorKeyId: string;
  issuer: string;
  manifestSignature: string;
  operatorToken: string;
}
