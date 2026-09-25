import { createContext, useContext } from 'react';
export const AdminPermissions = createContext({ admin: null, canWrite: false, canManageRoles: false });
export const useAdminPermissions = () => useContext(AdminPermissions);
export function AdminWrite({ children }) {
  return useAdminPermissions().canWrite ? children : null;
}
export function AdminEditFields({ children, disabled = false }) {
  return <fieldset disabled={disabled || !useAdminPermissions().canWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>;
}
