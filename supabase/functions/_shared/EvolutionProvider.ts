export type WaStatus='open'|'connecting'|'close'|'unknown';
export type MediaKind='image'|'document'|'audio'|'video';
const clean=(s:string)=>s.replace(/\/+$/,'');
export class EvolutionProvider{
 private base:string;
 constructor(private config:{baseUrl:string;apiKey:string;webhookUrl?:string;webhookSecret?:string}){this.base=clean(config.baseUrl)}
 private async call(path:string,init:RequestInit={}){const response=await fetch(`${this.base}${path}`,{...init,headers:{'Content-Type':'application/json','apikey':this.config.apiKey,...(init.headers||{})}});const body=await response.text();let data:any={};try{data=body?JSON.parse(body):{}}catch{data={message:body}}if(!response.ok)throw new Error(`Evolution API ${response.status}: ${String(data.message||data.error||'request failed').slice(0,180)}`);return data}
 async createInstance(instanceName:string){const body:any={instanceName,integration:'WHATSAPP-BAILEYS',qrcode:true};if(this.config.webhookUrl&&this.config.webhookSecret)body.webhook={url:this.config.webhookUrl,byEvents:false,base64:true,headers:{authorization:`Bearer ${this.config.webhookSecret}`},events:['QRCODE_UPDATED','CONNECTION_UPDATE','MESSAGES_UPSERT','MESSAGES_UPDATE','SEND_MESSAGE']};const d=await this.call('/instance/create',{method:'POST',body:JSON.stringify(body)});const qr=d.qrcode?.base64||d.qrcode?.code||d.qrCode||d.base64||'';return{instanceName,qrCode:qr,status:(d.instance?.state==='open'?'open':'connecting') as WaStatus}}
 async getQrCode(name:string){const d=await this.call(`/instance/connect/${encodeURIComponent(name)}`);return d.base64||d.code||d.qrcode?.base64||d.qrcode?.code||''}
 async getStatus(name:string){const d=await this.call(`/instance/connectionState/${encodeURIComponent(name)}`);const s=d.instance?.state||d.state||d.status;return(s==='open'?'open':s==='connecting'?'connecting':s==='close'?'close':'unknown') as WaStatus}
 async sendText(name:string,number:string,text:string){return this.call(`/message/sendText/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify({number,text})})}
 async sendMedia(name:string,number:string,media:string,kind:MediaKind,caption='',fileName='arquivo'){const ext=fileName.toLowerCase().split('.').pop();const mimetype=kind==='image'?(ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg'):kind==='audio'?(ext==='ogg'?'audio/ogg':ext==='mp4'?'audio/mp4':'audio/mpeg'):kind==='document'?'application/pdf':'video/mp4';return this.call(`/message/sendMedia/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify({number,mediatype:kind,mimetype,caption,media,fileName})})}
 async sendPresence(name:string,number:string,presence:'composing'|'paused'){return this.call(`/chat/sendPresence/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify({number,presence,delay:1000})})}
 async disconnect(name:string){await this.call(`/instance/logout/${encodeURIComponent(name)}`,{method:'DELETE'})}
}
