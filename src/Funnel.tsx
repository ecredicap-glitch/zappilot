import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ContactRound, LoaderCircle, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

type Stage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
type Contact = { id: string; name: string; phone: string; product: string | null };
type Lead = { id: string; contact_id: string; stage_id: string; status: string; contacts: Contact | Contact[] };
const contactOf = (lead: Lead): Contact => Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts;

export default function Funnel() {
  const [stages, setStages] = useState<Stage[]>([]); const [leads, setLeads] = useState<Lead[]>([]); const [contacts, setContacts] = useState<Contact[]>([]);
  const [workspace, setWorkspace] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [adding, setAdding] = useState(false); const [contactId, setContactId] = useState(''); const [stageId, setStageId] = useState('');
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Entre no workspace para carregar o funil.'); setLoading(false); return; }
    const { data: member, error: memberError } = await supabase.from('members').select('workspace_id').eq('user_id', user.id).maybeSingle();
    if (memberError || !member) { setError('Vínculo do workspace não encontrado.'); setLoading(false); return; }
    setWorkspace(member.workspace_id);
    const [{ data: stageRows, error: stageError }, { data: leadRows, error: leadError }, { data: contactRows, error: contactError }] = await Promise.all([
      supabase.from('pipeline_stages').select('id,name,position,is_won,is_lost').eq('workspace_id', member.workspace_id).order('position'),
      supabase.from('leads').select('id,contact_id,stage_id,status,contacts(id,name,phone,product)').eq('workspace_id', member.workspace_id).order('updated_at', { ascending: false }),
      supabase.from('contacts').select('id,name,phone,product').eq('workspace_id', member.workspace_id).eq('status', 'active').order('name').limit(1000),
    ]);
    if (stageError || leadError || contactError) setError('Não foi possível carregar as etapas ou oportunidades. Confira as migrações do funil.');
    else { setStages((stageRows || []) as Stage[]); setLeads((leadRows || []) as Lead[]); setContacts((contactRows || []) as Contact[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const available = useMemo(() => contacts.filter(c => !leads.some(l => l.contact_id === c.id)), [contacts, leads]);
  const filtered = (stageId: string) => leads.filter(l => l.stage_id === stageId && `${contactOf(l)?.name || ''} ${contactOf(l)?.phone || ''} ${contactOf(l)?.product || ''}`.toLowerCase().includes(query.toLowerCase()));
  const addLead = async () => {
    if (!supabase || !workspace || !contactId || !stageId) return;
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('leads').insert({ workspace_id: workspace, contact_id: contactId, stage_id: stageId, status: 'open' });
    if (insertError) setError(insertError.message); else { setAdding(false); setContactId(''); await load(); }
    setBusy(false);
  };
  const moveLead = async (lead: Lead, nextStageId: string) => {
    if (!supabase || nextStageId === lead.stage_id) return;
    setBusy(true); setError('');
    const next = stages.find(s => s.id === nextStageId);
    const { error: updateError } = await supabase.from('leads').update({ stage_id: nextStageId, status: next?.is_won ? 'won' : next?.is_lost ? 'lost' : 'open', updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', lead.id);
    if (updateError) setError(updateError.message); else await load();
    setBusy(false);
  };
  const removeLead = async (lead: Lead) => {
    if (!supabase || !confirm(`Remover ${contactOf(lead)?.name || 'este contato'} do funil?`)) return;
    const { error: deleteError } = await supabase.from('leads').delete().eq('id', lead.id);
    if (deleteError) setError(deleteError.message); else await load();
  };

  if (!isSupabaseConfigured) return <section className="inbox-empty glass"><Users size={24}/><h2>Conecte o Supabase para usar o funil</h2><p>As oportunidades serão salvas no banco do workspace.</p></section>;
  return <><div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> PIPELINE COMERCIAL</div><h1>Funil</h1><p>Mova oportunidades entre etapas e acompanhe o andamento real.</p></div><button className="primary-btn" disabled={!available.length || !stages.length} onClick={() => { setStageId(stages[0]?.id || ''); setAdding(true); }}><Plus size={16}/> Adicionar contato</button></div>
    {error && <div className="campaign-error"><AlertTriangle size={15}/>{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
    <div className="funnel-toolbar glass"><label className="table-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar oportunidade ou contato"/></label><span>{leads.length} oportunidades · {available.length} contatos disponíveis</span></div>
    {loading ? <div className="wa-empty"><LoaderCircle className="spin" size={22}/><span>Carregando funil…</span></div> : stages.length === 0 ? <div className="empty-contacts"><AlertTriangle size={24}/><strong>Nenhuma etapa configurada</strong><span>Reaplique a migração da caixa de entrada para criar as etapas padrão.</span></div> : <div className="funnel-board">{stages.map(stage => { const stageLeads = filtered(stage.id); return <section className="funnel-column glass" key={stage.id}><header><strong>{stage.name}</strong><span>{stageLeads.length}</span></header><div className="funnel-cards">{stageLeads.map(lead => { const contact = contactOf(lead); return <article className="funnel-lead" key={lead.id}><div className="funnel-lead-name"><span className="person-avatar">{(contact?.name || '?').slice(0, 1).toUpperCase()}</span><div><strong>{contact?.name || 'Contato'}</strong><small>{contact?.phone}</small></div></div>{contact?.product && <span className="product-pill">{contact.product}</span>}<label>Mover para<select disabled={busy} value={lead.stage_id} onChange={e => void moveLead(lead, e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="funnel-remove" disabled={busy} title="Remover do funil" onClick={() => void removeLead(lead)}><Trash2 size={14}/></button></article>; })}{stageLeads.length === 0 && <div className="funnel-empty">Nenhuma oportunidade</div>}</div></section>; })}</div>}
    {adding && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setAdding(false); }}><div className="modal-card"><div className="modal-head"><div><span className="modal-icon"><ContactRound size={18}/></span><h2>Adicionar ao funil</h2><p>Escolha um contato existente e a etapa inicial.</p></div><button onClick={() => setAdding(false)}><X size={18}/></button></div><div className="map-grid single"><label>Contato<select value={contactId} onChange={e => setContactId(e.target.value)}><option value="">Selecione um contato</option>{available.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label><label>Etapa<select value={stageId} onChange={e => setStageId(e.target.value)}>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setAdding(false)}>Cancelar</button><button className="primary-btn" disabled={busy || !contactId || !stageId} onClick={() => void addLead()}>{busy ? <LoaderCircle className="spin" size={15}/> : <ArrowRight size={15}/>} Adicionar oportunidade</button></div></div></div>}
  </>;
}
