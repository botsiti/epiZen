import { $, expect } from '@wdio/globals';
import { prepareWindow, screenshot } from '../support';

describe('started with a vault folder that does not exist', () => {
  before(prepareWindow);

  it('shows the error instead of an empty vault', async () => {
    await expect($('[data-testid="vault-error"]')).toBeDisplayed();
    await expect($('[data-testid="vault-error"]')).toHaveText(expect.stringContaining('epizen-no-such-vault'));
    await screenshot('02-vault-error');
  });
});
