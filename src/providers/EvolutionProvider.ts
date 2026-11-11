import type {WhatsAppProvider,WaStatus,MediaKind} from './WhatsAppProvider';import{isSupabaseConfigured,supabase}from'../supabase';
/** Thin browser adapter. Credentials remain in Supabase Edge Function secrets. */
export class EvolutionProvider implements WhatsAppProvider{
 private async invoke(action:string,args:Record<string,unknown>={}){if(!isSupabaseConfigured||!supabase)throw new Error('Configure o Supabase para conectar o WhatsApp.');const{data,error}=await supabase.functions.invoke('whatsapp-admin',{body:{action,...args}});if(error)throw new Error('Falha ao comunicar com o serviço WhatsApp.');if(data?.error)throw new Error(data.error);return data}
 async createInstance(name:string){return this.invoke('createInstance',{instanceName:name}) as Promise<{instanceName:string;qrCode?:string;status:WaStatus}>}
 async getQrCode(instanceName:string){const d=await this.invoke('getQrCode',{instanceName});return String(d.qrCode||'')}
 async getStatus(instanceName:string){const d=await this.invoke('getStatus',{instanceName});return d.status as WaStatus}
 async sendText(instanceName:string,number:string,text:string){return this.invoke('sendText',{instanceName,number,text})}
 async sendMedia(instanceName:string,number:string,media:string,kind:MediaKind,caption='',fileName='arquivo'){return this.invoke('sendMedia',{instanceName,number,media,kind,caption,fileName})}
 async disconnect(instanceName:string){await this.invoke('disconnect',{instanceName})}
 async handleWebhook(_request:Request):Promise<Response>{throw new Error('Webhooks são recebidos exclusivamente pela Edge Function whatsapp-webhook.')}
}
export const whatsAppProvider=new EvolutionProvider();

