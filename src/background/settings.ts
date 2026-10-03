import { browser } from 'wxt/browser';
import { z } from 'zod';
import type { PublicSettings, Settings } from '../shared/types';
import { isWebOrigin } from '../core/security';
export const defaultSettings:Settings={enabled:true,level:5000,allSites:false,sites:{},theme:'system',api:{baseUrl:'',apiKey:'',model:''}};
export const apiSchema=z.object({baseUrl:z.string().max(2000),apiKey:z.string().max(2000),model:z.string().max(200)}).strict();
export const settingsPatchSchema=z.object({enabled:z.boolean().optional(),level:z.union([z.literal(3000),z.literal(5000),z.literal(8000)]).optional(),allSites:z.boolean().optional(),sites:z.record(z.string().refine(isWebOrigin),z.boolean()).optional(),theme:z.enum(['system','light','dark']).optional(),api:apiSchema.optional()}).strict();
export async function getSettings():Promise<Settings> {
  const value=(await browser.storage.local.get('settings')).settings;
  const parsed=settingsPatchSchema.safeParse(value);
  return {...defaultSettings,...(parsed.success?parsed.data:{}),api:{...defaultSettings.api,...(parsed.success?parsed.data.api:{})}};
}
export async function publicSettings():Promise<PublicSettings> {
  const {api,...settings}=await getSettings();return {...settings,apiConfigured:!!(api.baseUrl&&api.model)};
}
let writeQueue=Promise.resolve();
async function writeSettings(input:unknown):Promise<Settings> {
  const patch=settingsPatchSchema.parse(input);const settings=await getSettings();
  const updated={...settings,...patch,sites:{...settings.sites,...patch.sites}};
  await browser.storage.local.set({settings:updated});return updated;
}
export async function updateSettings(input:unknown):Promise<Settings> {
  const work=writeQueue.then(()=>writeSettings(input));writeQueue=work.then(()=>{},()=>{});return work;
}
