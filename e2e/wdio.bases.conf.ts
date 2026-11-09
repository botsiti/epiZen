import { config as base } from './wdio.conf';
export const config: WebdriverIO.Config = {
  ...base,
  capabilities: (base.capabilities as WebdriverIO.Capabilities[]).filter((cap) => ['bases.e2e', 'base-files.e2e', 'plugins.e2e', 'preferences.e2e', 'setup.e2e'].some((name) => JSON.stringify(cap).includes(name))),
};
