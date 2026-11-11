import { useEffect, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, ContactRound, LoaderCircle, Send, ShieldCheck, Users } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

type Campaign = { id: string; title: string; scheduled_start: string; status: string; total_count: number };
type Day = { label: string; sent: number; replies: number };

export default function Overview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Workspace');
  const [contactCount, setContactCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const [onlineNumber, setOnlineNumber] = useState('Nenhum número conectado');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase || !isSupabaseConfigured) { setBusy(false); return; }
      setBusy(true); setError('');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Entre para carregar os dados do workspace.'); setBusy(false); return; }
      const { data: member, error: memberError } = await supabase.from('members').select('workspace_id,display_name,workspaces(name)').eq('user_id', user.id).maybeSingle();
      if (memberError || !member) { setError('Não encontramos o vínculo deste usuário com um workspace.'); setBusy(false); return; }
      const workspace = Array.isArray(member.workspaces) ? member.workspaces[0] : member.workspaces;
      const since = new Date(Date.now() - 6 * 86400000); since.setHours(0, 0, 0, 0);
      const [{ count: contacts, error: contactsError }, { data: outbound, error: outboundError }, { data: inbound, error: inboundError }, { data: instances }, { data: nextCampaigns }] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', member.workspace_id).eq('status', 'active'),
        supabase.from('campaign_messages').select('id,status,sent_at').eq('workspace_id', member.workspace_id).not('sent_at', 'is', null).gte('sent_at', since.toISOString()),
        supabase.from('messages').select('id,created_at,direction').eq('workspace_id', member.workspace_id).eq('direction', 'inbound').gte('created_at', since.toISOString()),
        supabase.from('wa_instances').select('phone_number,instance_name,status').eq('workspace_id', member.workspace_id).eq('status', 'open').limit(1),
        supabase.from('campaigns').select('id,title,status,scheduled_start,total_count').eq('workspace_id', member.workspace_id).in('status', ['scheduled', 'running']).order('scheduled_start').limit(5),
      ]);
      if (!alive) return;
      if (contactsError || outboundError || inboundError) { setError('Falha ao carregar indicadores reais. Confira as políticas e as migrações do Supabase.'); setBusy(false); return; }
      const sent = outbound || []; const replies = inbound || [];
      setWorkspaceName(workspace?.name || member.display_name || user.email || 'Workspace');
      setContactCount(contacts || 0); setSentCount(sent.length);
      setDeliveredCount(sent.filter((item: any) => ['delivered', 'read', 'replied'].includes(item.status)).length);
      setReplyCount(replies.length);
      setOnlineNumber(instances?.[0] ? (instances[0].phone_number || instances[0].instance_name) : 'Nenhum número conectado');
      setCampaigns((nextCampaigns || []) as Campaign[]);
      const buckets: Day[] = Array.from({ length: 7 }, (_, i) => { const date = new Date(since); date.setDate(since.getDate() + i); return { label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), sent: 0, replies: 0 }; });
      for (const item of sent) { const idx = Math.floor((new Date(item.sent_at).setHours(0, 0, 0, 0) - since.getTime()) / 86400000); if (buckets[idx]) buckets[idx].sent++; }
      for (const item of replies) { const idx = Math.floor((new Date(item.created_at).setHours(0, 0, 0, 0) - since.getTime()) / 86400000); if (buckets[idx]) buckets[idx].replies++; }
      setDays(buckets); setBusy(false);
    };
    void load();
    const channel = supabase?.channel('overview-live').on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_messages' }, () => void load()).on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void load()).on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => void load()).subscribe();
    return () => { alive = false; if (channel) void supabase?.removeChannel(channel); };
  }, []);

  const delivery = sentCount ? Math.round(deliveredCount / sentCount * 1000) / 10 : 0;
  const response = deliveredCount ? Math.round(replyCount / deliveredCount * 1000) / 10 : 0;
  const max = Math.max(1, ...days.flatMap(d => [d.sent, d.replies]));
  const name = workspaceName.split(/[ @]/)[0] || 'Olá';

  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> DADOS DO WORKSPACE</div><h1>Olá, {name}</h1><p>Resumo calculado a partir dos seus contatos e mensagens.</p></div><button className="primary-btn" onClick={() => onNavigate('Campanhas')}><Send size={16}/> Nova campanha</button></div>
    {error && <div className="campaign-error">{error}</div>}
    <section className="health glass"><div className="health-icon"><Activity size={20}/></div><div className="health-info"><div className="health-title">WhatsApp <span className={onlineNumber.startsWith('Nenhum') ? 'campaign-state paused' : 'connected'}><i/> {onlineNumber.startsWith('Nenhum') ? 'Não conectado' : 'Conectado'}</span></div><div className="health-sub">{onlineNumber}</div></div><div className="health-tip">{busy ? 'Atualizando os dados…' : 'Status consultado no Supabase.'}</div><button className="health-more" onClick={() => onNavigate('WhatsApp')}>Configurar <ArrowUpRight size={14}/></button></section>
    <div className="section-heading"><div><h2>Visão geral</h2><p>Últimos 7 dias · dados reais</p></div>{busy && <LoaderCircle className="spin" size={18}/>}</div>
    <div className="metrics">
      {[{name:'Contatos ativos',value:contactCount.toLocaleString('pt-BR'),icon:Users,tone:'lime',hint:'na sua base'},{name:'Mensagens enviadas',value:sentCount.toLocaleString('pt-BR'),icon:ArrowUpRight,tone:'blue',hint:'com envio confirmado'},{name:'Taxa de entrega',value:`${delivery.toLocaleString('pt-BR')}%`,icon:ShieldCheck,tone:'violet',hint:`${deliveredCount} entregues`},{name:'Respostas recebidas',value:replyCount.toLocaleString('pt-BR'),icon:ArrowDownLeft,tone:'orange',hint:`${response.toLocaleString('pt-BR')}% sobre entregues`}].map(({name:label,value,icon:Icon,tone,hint})=><article className="metric glass" key={label}><div className="metric-top"><div className={'metric-icon '+tone}><Icon size={17}/></div></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{label}</span><small>{hint}</small></div></article>)}
    </div>
    <div className="lower-grid"><section className="chart-card glass"><div className="card-heading"><div><h3>Envios e respostas</h3><p>Mensagens registradas nos últimos 7 dias</p></div></div>{days.every(d => !d.sent && !d.replies) ? <div className="empty-contacts"><Activity size={23}/><strong>Sem atividade no período</strong><span>Os dados aparecerão após receber ou enviar mensagens.</span></div> : <div className="real-chart">{days.map(day=><div className="real-chart-day" key={day.label}><div className="real-chart-bars"><i title={`${day.sent} enviadas`} style={{height:`${Math.max(day.sent ? 5 : 0, day.sent / max * 100)}%`}}/><b title={`${day.replies} respostas`} style={{height:`${Math.max(day.replies ? 5 : 0, day.replies / max * 100)}%`}}/></div><small>{day.label}</small></div>)}</div>}</section>
      <section className="actions-card glass"><div className="card-heading"><div><h3>Campanhas em andamento</h3><p>Agendamentos e envios ativos</p></div></div>{campaigns.length ? <div className="action-list">{campaigns.map(c=><div className="action-item" key={c.id}><div className="action-icon lime-bg"><Send size={15}/></div><div className="action-copy"><strong>{c.title}</strong><span>{c.status === 'scheduled' ? `Agendada para ${new Date(c.scheduled_start).toLocaleString('pt-BR')}` : `${c.total_count} destinatários · em andamento`}</span></div><div className="action-tag scheduled">{c.status === 'scheduled' ? 'Agendada' : 'Ativa'}</div></div>)}</div> : <div className="empty-contacts"><ContactRound size={23}/><strong>Nenhuma campanha ativa</strong><span>Campanhas agendadas aparecerão aqui.</span></div>}<button className="all-actions" onClick={() => onNavigate('Campanhas')}>Abrir campanhas <ArrowUpRight size={14}/></button></section></div>
    <footer>ZapPilot <span>·</span> {workspaceName} <span className="footer-right">{busy ? 'Atualizando…' : 'Indicadores do Supabase'} <i/></span></footer>
  </>;
}
