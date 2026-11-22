import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useApp } from '@/store/AppStore';
import { useI18n } from '@/i18n';
import { backend } from '@/services/backend';
import { errorKey } from '@/lib/errors';
import type { TKey } from '@/i18n';

const field = 'h-11 w-full rounded-xl bg-surface-2 px-3 text-fg ring-1 ring-line outline-none transition focus:bg-surface focus:ring-primary placeholder:text-fg-subtle';

export function AuthModal() {
  const { auth, openAuth, closeAuth, setMe, config, navigate } = useApp();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setError(null); setPassword(''); }, [auth]);
  if (!auth) return null;
  const signup = auth === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const me = signup ? await backend.register({ email, password, name }) : await backend.login({ email, password });
      setMe(me);
      closeAuth();
    } catch (err) {
      setError(errorKey(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={closeAuth} title={t(signup ? 'auth.signUpTitle' : 'auth.signInTitle')} className="max-w-sm">
      <form onSubmit={submit} className="flex flex-col gap-4 p-6" noValidate>
        <div className="pe-8">
          <h2 className="font-display text-2xl font-bold">{t(signup ? 'auth.signUpTitle' : 'auth.signInTitle')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{signup ? t('auth.bonus', { n: config?.signupCredits ?? 30 }) : t('auth.needed')}</p>
        </div>
        {signup && (
          <label className="block text-sm font-medium">
            {t('auth.name')}
            <input id="auth-name" className={`${field} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </label>
        )}
        <label className="block text-sm font-medium">
          {t('auth.email')}
          <input id="auth-email" className={`${field} mt-1.5`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          {t('auth.password')}
          <input id="auth-password" className={`${field} mt-1.5`} type="password" required minLength={signup ? 8 : undefined} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} />
          {signup && <span className="mt-1 block text-xs text-fg-subtle">{t('auth.passwordHint')}</span>}
        </label>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(error)}</p>}
        <Button type="submit" size="lg" disabled={busy || !email || !password}>
          {busy && <Loader2 size={18} className="animate-spin" />} {t(signup ? 'auth.signUp' : 'auth.signIn')}
        </Button>
        <button type="button" onClick={() => openAuth(signup ? 'signin' : 'signup')} className="text-sm font-semibold text-primary hover:underline cursor-pointer">
          {t(signup ? 'auth.toSignIn' : 'auth.toSignUp')}
        </button>
        {signup && (
          <p className="text-xs text-fg-subtle">
            {t('auth.agree')}{' '}
            <button type="button" className="underline cursor-pointer" onClick={() => { closeAuth(); navigate('terms'); }}>{t('legal.terms')}</button>
            {' · '}
            <button type="button" className="underline cursor-pointer" onClick={() => { closeAuth(); navigate('privacy'); }}>{t('legal.privacy')}</button>
          </p>
        )}
        {backend.kind === 'demo' && <p className="text-center text-xs text-fg-subtle">{t('auth.demo')}</p>}
      </form>
    </Modal>
  );
}
