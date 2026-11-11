export type WaStatus='open'|'connecting'|'close'|'unknown';
export type MediaKind='image'|'document'|'audio'|'video';
export interface WhatsAppProvider{createInstance(name:string):Promise<{instanceName:string;qrCode?:string;status:WaStatus}>;getQrCode(instanceName:string):Promise<string>;getStatus(instanceName:string):Promise<WaStatus>;sendText(instanceName:string,number:string,text:string):Promise<unknown>;sendMedia(instanceName:string,number:string,media:string,kind:MediaKind,caption?:string,fileName?:string):Promise<unknown>;disconnect(instanceName:string):Promise<void>;handleWebhook(request:Request):Promise<Response>}

