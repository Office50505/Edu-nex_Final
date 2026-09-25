import { renderAdmin as render } from "../helpers/adminRender.jsx";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MarketingSettings } from '../../src/pages/admin/MarketingSettings';
import { adminJson } from '../../src/pages/admin/adminApi';

vi.mock('../../src/pages/admin/adminApi', () => ({ adminJson: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('sends the Pixel ID string instead of the input element', async () => {
  const settings = { metaPixelEnabled: false, metaPixelId: '' };
  adminJson
    .mockResolvedValueOnce(settings)
    .mockResolvedValueOnce({ metaPixelEnabled: true, metaPixelId: '2162439717950749' });

  render(<MarketingSettings />);
  const input = await screen.findByLabelText('Meta Pixel ID');
  fireEvent.change(input, { target: { value: '2162439717950749' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Enable Meta Pixel/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Meta Pixel settings' }));

  await waitFor(() => expect(adminJson).toHaveBeenCalledTimes(2));
  expect(adminJson.mock.calls[1][1].body).toBe(
    '{"metaPixelEnabled":true,"metaPixelId":"2162439717950749"}',
  );
});
