import { renderAdmin as render } from "../helpers/adminRender.jsx";
// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PaymentGatewaySettings } from '../../src/pages/admin/PaymentGatewaySettings';
import { adminJson } from '../../src/pages/admin/adminApi';
vi.mock('../../src/pages/admin/adminApi', () => ({adminJson: vi.fn()}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const settings = { mode: 'test', modes: {test:{configured:true},live:{configured:true}} };
it('switches mode only on Apply and displays the server-confirmed result',async()=>{
 adminJson.mockResolvedValueOnce(settings).mockResolvedValueOnce({...settings,mode:'live'});
 render(<PaymentGatewaySettings/>);
 const live=await screen.findByRole('radio',{name:/Live — charge real money/});
 fireEvent.click(live);expect(adminJson).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Apply Live mode'}));
 await screen.findByText('New checkouts now use Live mode.');
 expect(adminJson.mock.calls[1][1].body).toBe('{"mode":"live"}');
 expect(screen.getByRole('button',{name:'Apply Live mode'}).disabled).toBe(true);
});
it('missing credentials disable a mode and an API failure keeps the active mode',async()=>{
 adminJson.mockResolvedValueOnce({...settings,modes:{...settings.modes,live:{configured:false,detail:'Missing live plan'}}});
 const first=render(<PaymentGatewaySettings/>);
 expect((await screen.findByRole('radio',{name:/Live — charge real money/})).disabled).toBe(true);
 first.unmount();
 adminJson.mockResolvedValueOnce(settings).mockRejectedValueOnce(new Error('Plan price mismatch'));
 render(<PaymentGatewaySettings/>);
 fireEvent.click(await screen.findByRole('radio',{name:/Live — charge real money/}));
 fireEvent.click(screen.getByRole('button',{name:'Apply Live mode'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Plan price mismatch'));
 expect(screen.getByText('Test — use Razorpay test payments')).toBeTruthy();
});
