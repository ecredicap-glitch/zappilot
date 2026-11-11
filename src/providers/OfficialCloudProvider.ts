import type{WhatsAppProvider,WaStatus,MediaKind}from'./WhatsAppProvider';
/** Future adapter placeholder. Official Cloud API is intentionally not wired yet. */
export class OfficialCloudProvider implements WhatsAppProvider{
 private unavailable():never{throw new Error('O provedor oficial ainda não está habilitado neste produto.')}
 async createInstance(_name:string):Promise<{instanceName:string;qrCode?:string;status:WaStatus}>{return this.unavailable()}
 async getQrCode(_name:string):Promise<string>{return this.unavailable()}
 async getStatus(_name:string):Promise<WaStatus>{return this.unavailable()}
 async sendText(_name:string,_number:string,_text:string):Promise<unknown>{return this.unavailable()}
 async sendMedia(_name:string,_number:string,_media:string,_kind:MediaKind,_caption?:string,_fileName?:string):Promise<unknown>{return this.unavailable()}
 async disconnect(_name:string):Promise<void>{return this.unavailable()}
 async handleWebhook(_request:Request):Promise<Response>{return this.unavailable()}
}

