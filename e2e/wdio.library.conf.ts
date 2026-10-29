import { config as base } from './wdio.conf';

// A focused run must launch the vault scenario alone. CLI --spec otherwise replaces
// the scenario for all four capabilities, including the no-vault and large-graph apps.
if (!Array.isArray(base.capabilities)) throw new Error('Expected the E2E launch scenarios.');
export const config: WebdriverIO.Config = {
  ...base,
  capabilities: [base.capabilities[2]!],
  mochaOpts: { ...base.mochaOpts, grep: 'library controls:' },
};
