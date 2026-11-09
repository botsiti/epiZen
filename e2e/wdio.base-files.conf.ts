import { config as base } from './wdio.conf';
export const config: WebdriverIO.Config = {
  ...base,
  capabilities: (base.capabilities as WebdriverIO.Capabilities[]).filter((cap) => JSON.stringify(cap).includes('base-files.e2e')),
};
