import { $, expect } from '@wdio/globals';
import { prepareWindow, screenshot } from '../support';

describe('started without a vault', () => {
  before(prepareWindow);

  it('says how to open one', async () => {
    await expect($('[data-testid="no-vault"]')).toBeDisplayed();
    await expect($('h1')).toHaveText('No vault open');
    await screenshot('01-no-vault');
  });
});
