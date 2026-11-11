import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Command, ContactRound, FileText, HelpCircle, Home, Inbox, Kanban, LogOut, Menu, Moon, Search, Send, Settings, Sun, Users, Wallet, X, Zap } from 'lucide-react';
import Contacts from './Contacts';
import Funnel from './Funnel';
import WhatsApp from './WhatsApp';
import Campaigns from './Campaigns';
import Templates from './Templates';
import InboxPage from './Inbox';
import Overview from './Overview';
import { supabase } from './supabase';

const nav = [['Visão geral', Home], ['Funil', Kanban], ['Contatos', ContactRound], ['Campanhas', Send], ['Conversas', Inbox], ['Cadências', Activity], ['Templates', FileText], ['WhatsApp', Zap], ['Planos e créditos', Wallet], ['Configurações', Settings]] as const;

export default function App() {
  const [active, setActive] = useState('Visão geral'); const [dark, setDark] = useState(true); const [commandOpen, setCommandOpen] = useState(false); const [search, setSearch] = useState(''); const [mobile, setMobile] = useState(false); const [menu, setMenu] = useState<'profile' | 'notifications' | 'help' | null>(null); const [email, setEmail] = useState(''); const [displayName, setDisplayName] = useState(''); const [workspaceName, setWorkspaceName] = useState('Workspace');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { user } } = await supabase?.auth.getUser() || { data: { user: null } };
      if (!alive || !user) return;
      const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';
      setEmail(user.email || ''); setDisplayName(name);
      const { data: member } = await supabase!.from('members').select('workspace_id,display_name,workspaces(name)').eq('user_id', user.id).maybeSingle();
      if (!alive) return;
      const workspace = Array.isArray(member?.workspaces) ? member?.workspaces[0] : member?.workspaces;
      setWorkspaceName(workspace?.name || 'Workspace'); setDisplayName(member?.display_name || name);
    })();
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); } if (event.key === 'Escape') { setCommandOpen(false); setMenu(null); } };
    window.addEventListener('keydown', key); return () => { alive = false; window.removeEventListener('keydown', key); };
  }, []);
  const matches = useMemo(() => nav.filter(([label]) => label.toLowerCase().includes(search.toLowerCase())), [search]);
  const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'U';
  const signOut = async () => { setMenu(null); await supabase?.auth.signOut(); };
  const navigate = (page: string) => { setActive(page); setMobile(false); setMenu(null); };
  return <div className={dark ? 'app dark' : 'app light'}>
    <aside className={'sidebar ' + (mobile ? 'show' : '')}>
      <div className="brand"><div className="brandmark"><Zap size={21} fill="currentColor"/></div><span>zap<span className="brand-light">pilot</span></span><button className="close-mobile" onClick={() => setMobile(false)}><X/></button></div>
      <button className="workspace" onClick={() => setMenu(menu === 'help' ? null : 'help')}><div className="ws-avatar">{workspaceName.slice(0, 1).toUpperCase()}</div><div className="ws-copy"><strong>{workspaceName}</strong><small>Workspace atual</small></div><span>⌄</span></button>
      <div className="nav-label">MENU PRINCIPAL</div><nav>{nav.map(([label, Icon]) => <button key={label} className={'nav-item ' + (active === label ? 'active' : '')} onClick={() => navigate(label)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className="profile profile-button" onClick={() => setMenu(menu === 'profile' ? null : 'profile')}><div className="user-avatar">{initials}</div><div className="profile-copy"><strong>{displayName || 'Carregando usuário…'}</strong><small>{email || 'Conta autenticada'}</small></div><span>···</span></button></div>
    </aside>
    <main className="main"><header className="topbar"><div className="top-left"><button className="mobile-menu" onClick={() => setMobile(true)}><Menu/></button><div className="breadcrumb">{workspaceName} <span>/</span> <b>{active}</b></div></div><button className="global-search" onClick={() => setCommandOpen(true)}><Search size={16}/><span>Buscar ou ir para...</span><kbd><Command size={11}/> K</kbd></button><div className="top-actions"><button className="icon-btn theme-btn" onClick={() => setDark(!dark)} title="Alternar tema">{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="icon-btn notification" title="Notificações" onClick={() => setMenu(menu === 'notifications' ? null : 'notifications')}><Bell size={18}/></button><div className="top-divider"/><button className="help" onClick={() => setMenu(menu === 'help' ? null : 'help')}><HelpCircle size={17}/><span>Ajuda</span></button><button className="top-avatar" title="Abrir perfil" onClick={() => setMenu(menu === 'profile' ? null : 'profile')}>{initials}</button></div></header>
      {menu && <div className="top-popover">{menu === 'profile' ? <><strong>{displayName || 'Usuário'}</strong><span>{email}</span><button onClick={() => void signOut()}><LogOut size={15}/> Sair da conta</button></> : menu === 'notifications' ? <><strong>Notificações</strong><span>Novos alertas de campanhas aparecerão aqui.</span><button onClick={() => navigate('Campanhas')}><Send size={15}/> Ver campanhas</button></> : <><strong>{menu === 'help' ? workspaceName : 'Ajuda do ZapPilot'}</strong><span>Use Contatos para importar pessoas, Funil para acompanhar oportunidades e Campanhas para preparar envios.</span><button onClick={() => navigate('Configurações')}><Settings size={15}/> Configurações</button></>}</div>}
      <div className="content">{active === 'Visão geral' ? <Overview onNavigate={navigate}/> : active === 'Contatos' ? <Contacts/> : active === 'Funil' ? <Funnel/> : active === 'WhatsApp' ? <WhatsApp/> : active === 'Campanhas' ? <Campaigns/> : active === 'Templates' ? <Templates/> : active === 'Conversas' ? <InboxPage/> : <section className="inbox-empty glass"><Activity size={25}/><h2>{active}</h2><p>Esta área ainda não faz parte do MVP funcional. As funções essenciais estão em Contatos, Funil, Campanhas, Conversas e WhatsApp.</p><button className="primary-btn" onClick={() => navigate('Contatos')}>Abrir contatos</button></section>}</div>
    </main>
    {commandOpen && <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) setCommandOpen(false); }}><div className="command"><div className="command-input"><Search size={19}/><input autoFocus placeholder="O que você está procurando?" value={search} onChange={event => setSearch(event.target.value)}/><kbd>ESC</kbd></div><div className="command-label">NAVEGAR</div>{matches.map(([label, Icon]) => <button className="command-row" key={label} onClick={() => { navigate(label); setCommandOpen(false); setSearch(''); }}><span className="command-icon"><Icon size={17}/></span>{label}</button>)}<div className="command-footer"><span>Enter seleciona</span><span>Esc fecha</span></div></div></div>}
  </div>;
}
