// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import DeleteAccountPage from '../../src/pages/DeleteAccountPage';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function fill(){fireEvent.change(screen.getByLabelText('Account name'),{target:{value:'Learner'}});fireEvent.change(screen.getByLabelText('Registered mobile number'),{target:{value:'9876543210'}});fireEvent.change(screen.getByLabelText(/Contact email/),{target:{value:'learner@example.com'}});fireEvent.click(screen.getByRole('checkbox'));}
it('submits a request without presenting it as completed deletion',async()=>{const send=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});vi.stubGlobal('fetch',send);render(<DeleteAccountPage/>);fill();fireEvent.submit(screen.getByRole('button',{name:'Request deletion'}).closest('form'));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Your account has not been deleted yet'));expect(send.mock.calls[0][0]).toBe('/api/deletion-requests');expect(JSON.parse(send.mock.calls[0][1].body).confirm).toBe(true);});
it('keeps the form available when saving fails',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Please try again later.'})}));render(<DeleteAccountPage/>);fill();fireEvent.submit(screen.getByRole('button',{name:'Request deletion'}).closest('form'));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Please try again'));expect(screen.getByRole('button',{name:'Request deletion'}).disabled).toBe(false);});
