// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { AdminPermissions } from '../../src/pages/admin/AdminPermissions.jsx';
import { AdminUsersPage } from '../../src/pages/admin/AdminUsersPage.jsx';
import { AdminTeamPage } from '../../src/pages/admin/AdminTeamPage.jsx';
import { AdminApp } from '../../src/pages/admin/AdminApp.jsx';
import { adminJson, adminRequest } from '../../src/pages/admin/adminApi.js';
vi.mock('../../src/pages/admin/adminApi.js', async original => ({ ...await original(), adminJson: vi.fn(), requireAdmin: () => true }));
const learner = { _id: 'user-1', fullName: 'Test Learner', isActive: true, subscriptionStatus: 'none', purchasedCourses: [], isMobileVerified: true };
function show(ui, role) {
  return render(<AdminPermissions.Provider value={{ admin: { id: 'staff', role }, canWrite: role !== 'viewer', canManageRoles: role === 'admin' }}>{ui}</AdminPermissions.Provider>);
}
beforeEach(() => {
  adminJson.mockReset();
  localStorage.clear(); sessionStorage.clear();
  adminJson.mockImplementation(async path => {
    if (path === '/api/admin/user-management') return [learner];
    if (path === '/api/admin/team') return { accounts: [] };
    if (path.endsWith('/purchase-history')) return { orders: [], courseChanges: [] };
    return [];
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('viewer can inspect learners but cannot see mutation controls or team roles', async () => {
  show(<AdminUsersPage />, 'viewer');
  await screen.findByText('Test Learner');
  expect(screen.queryByRole('button', { name: 'Ban', exact: true })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Team access' })).toBeNull();
  expect(screen.queryByRole('link', { name: '+ Create / Upload' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Manage', exact: true }));
  expect(screen.queryByRole('button', { name: 'Update subscription' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add purchased course' })).toBeNull();
  expect(screen.getByRole('button', { name: 'View', exact: true })).toBeTruthy();
});
it('developer can change learners but cannot access role management', async () => {
  show(<AdminUsersPage />, 'developer');
  await screen.findByText('Test Learner');
  expect(screen.getByRole('button', { name: 'Ban', exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Manage', exact: true }));
  expect(screen.getByRole('button', { name: 'Update subscription' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Team access' })).toBeNull();
});
it.each(['viewer', 'developer'])('%s cannot load team account data directly', async role => {
  show(<AdminTeamPage />, role);
  expect(screen.getByRole('alert').textContent).toContain('admins only');
  expect(adminJson).not.toHaveBeenCalled();
});
it('admin can open team management and choose all three roles', async () => {
  show(<AdminTeamPage />, 'admin');
  expect(screen.getByRole('link', { name: 'Team access' })).toBeTruthy();
  expect(screen.getByLabelText('Role').options.length).toBe(3);
  expect(adminJson).toHaveBeenCalledWith('/api/admin/team');
});
it('direct team navigation waits for server identity and rejects developers', async () => {
  adminJson.mockResolvedValue({ admin: { id: 'staff', role: 'developer' } });
  render(<AdminApp page="team" />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'You do not have access to this page.');
  expect(adminJson.mock.calls.map(([path]) => path)).toEqual(['/api/admin/me']);
});
it('a forbidden write does not log out a valid viewer session', async () => {
  sessionStorage.setItem('edunexAdminToken', 'viewer-token');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
  expect((await adminRequest('/api/admin/users/user-1', { method: 'DELETE' })).status).toBe(403);
  expect(sessionStorage.getItem('edunexAdminToken')).toBe('viewer-token');
});
