import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { UserForm } from '@/components/UserForm';
import { api, currentRole } from '@/lib/api';

export default async function UsersPage() {
  if ((await currentRole()) !== 'ADMIN') redirect('/gerencia');
  const users = await api.users();
  const t = await getTranslations('users');
  const roles = await getTranslations('roles');

  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('title')}</h1>
      <UserForm />
      <section className="panel overflow-x-auto">
        {users.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('none')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('email')}</th>
                <th>{t('role')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="break-all">{user.email}</td>
                  <td>{roles(user.role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
