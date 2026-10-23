export function isTrustedContext(url:string|undefined,senderId:string|undefined,extensionId:string,extensionRoot:string):boolean {
  if(senderId!==extensionId||!url)return false;
  return url.startsWith(extensionRoot);
}
export function isWebOrigin(value:string):boolean {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.origin===value&&!url.username&&!url.password;}catch{return false;}
}
