import React from 'react';
import { render } from '@testing-library/react';
import { AdminPermissions } from '../../src/pages/admin/AdminPermissions.jsx';
export function renderAdmin(ui, options = {}) {
  return render(ui, { wrapper: ({ children }) => <AdminPermissions.Provider value={{ admin: { id: 'test-admin', role: 'admin' }, canWrite: true, canManageRoles: true }}>{children}</AdminPermissions.Provider>, ...options });
}
