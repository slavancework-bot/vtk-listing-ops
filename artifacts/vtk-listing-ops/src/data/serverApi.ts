import type { ItemDraft } from "@workspace/domain";
import type { ItemScenario } from "./mockData";

const actorId = "development-employee";
const apiBase=import.meta.env.VITE_API_BASE_URL??"/api";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { "content-type":"application/json", "x-development-user":actorId, ...init.headers } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) { const error=new Error(String(data.message ?? "Server request failed.")) as Error & {status?:number;data?:unknown}; error.status=response.status; error.data=data; throw error; }
  return data as T;
}
export interface ServerProgress {totalItemCount:number;completedCount:number;reviewCount:number;processedCount:number;pendingCount:number;percent:number;complete:boolean}
interface ServerItem {id:string;batchId:string;sourceRowId:string;sourceRowNumber:number;sku:string;normalizedValues:Record<string,unknown>;questionConfiguration:{includedQuestions:Array<Record<string,unknown>>;conditionRequired:boolean;conditionalFields:Array<Record<string,unknown>>};warnings:string[];status:string;version:number;draft:ItemDraft|null}
export function toScenario(item:ServerItem):ItemScenario { const n=item.normalizedValues; const q=item.questionConfiguration; return {id:item.id,scenarioLabel:String(n.scenario??item.sourceRowId),manufacturer:String(n.manufacturer??""),model:String(n.model??""),mpn:n.mpn?String(n.mpn):undefined,sku:item.sku,productName:String(n.title??""),shortDescription:n.shortDescription?String(n.shortDescription):undefined,includedQuestions:q.includedQuestions.map((value,index)=>({id:index+1,label:String(value.label??value.id??`Question ${index+1}`),important:Boolean(value.important)})),conditionRequired:q.conditionRequired,conditionalFields:q.conditionalFields.map((value)=>({key:String(value.id??value.key) as "qtyToList"|"checkCount"|"stockTotal"|"otherNotes",label:String(value.label),required:Boolean(value.required),defaultValue:value.defaultValue==null?undefined:String(value.defaultValue)})),preSelectedIncluded:[],preSelectedCondition:null,scenarioNote:item.warnings[0],requiresReview:false,categoryName:undefined}; }
export async function loadBatch(batchId:string){const [batch,result]=await Promise.all([request<{name:string;progress:ServerProgress}>(`/batches/${batchId}`),request<{items:ServerItem[]}>(`/batches/${batchId}/items`)]);return{batch,items:result.items};}
export async function saveDraft(itemId:string,draft:ItemDraft){return request(`/items/${itemId}/draft`,{method:"PUT",body:JSON.stringify({draft})});}
export async function saveFinal(itemId:string,draft:ItemDraft,review=false){return request<{itemId:string;itemVersion:number;status:string;nextItemId:string|null;replayed:boolean}>(`/items/${itemId}/${review?"needs-review":"answer"}`,{method:review?"POST":"PUT",headers:{"idempotency-key":crypto.randomUUID()},body:JSON.stringify(review?{draft,reason:{code:"workflow_exception",note:"Employee requested review."}}:{draft})});}
export async function loadProgress(batchId:string){return request<ServerProgress>(`/batches/${batchId}/progress`);}
