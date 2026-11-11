import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, Lock, Mail, Zap } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <>{children}<div className="demo-banner"><span>Supabase não configurado</span> Defina as variáveis de ambiente para acessar dados reais.</div></>;
  if (loading) return <div className="auth-loading">Carregando seu workspace…</div>;
  if (session) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    const { error: authError } = await supabase!.auth.signInWithPassword({ email, password });
    if (authError) setError('E-mail ou senha inválidos.');
    setBusy(false);
  };
  const magic = async () => {
    if (!email) { setError('Informe seu e-mail para receber o link.'); return; }
    setBusy(true); setError('');
    const { error: authError } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (authError) setError('Não foi possível enviar o link. Verifique o e-mail e as configurações de autenticação.');
    else setSent(true);
    setBusy(false);
  };

  return <div className="auth-screen"><div className="auth-glow"/><div className="auth-brand"><div className="brandmark"><Zap size={22} fill="currentColor"/></div><span>zap<span className="brand-light">pilot</span></span></div><form className="auth-card" onSubmit={submit}><div className="auth-eyebrow">SEU COCKPIT DE RELACIONAMENTO</div><h1>Bem-vinda de volta</h1><p>Acesse o workspace da sua equipe.</p><label>E-mail<div className="auth-field"><Mail size={16}/><input type="email" placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></div></label><label>Senha<div className="auth-field"><Lock size={16}/><input type="password" placeholder="Sua senha" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} autoComplete="current-password"/></div></label>{error&&<div className="auth-error">{error}</div>}{sent&&<div className="auth-success">Link de acesso enviado. Confira sua caixa de entrada.</div>}<button className="auth-submit" disabled={busy}>{busy?'Aguarde…':'Entrar no workspace'} <ArrowRight size={16}/></button><button type="button" disabled={busy} className="magic-link" onClick={()=>void magic()}>Enviar link de acesso por e-mail</button></form><div className="auth-legal">Acesso seguro ao seu workspace · ZapPilot</div></div>;
}
