import { expect,test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.skip(!process.env.PHASE2_E2E,"Requires the explicit disposable PostgreSQL staging path.");
test("imported PostgreSQL batch restores draft and completes with authoritative progress and audit",async({page,request},testInfo)=>{
  const {pool}=await import("@workspace/db");
  const content=await readFile(new URL("../../../fixtures/phase2-controlled-eight-scenarios-v1.csv",import.meta.url),"utf8");
  const imported=await request.post("http://127.0.0.1:4174/api/batches/import",{headers:{"x-development-user":"development-employee"},data:{importKey:`browser-${testInfo.project.name}`,filename:"phase2-eight.csv",mimeType:"text/csv",content,name:`Phase 2 ${testInfo.project.name}`}});expect(imported.status()).toBe(201);const {batchId}=await imported.json();
  await page.goto(`/employee?batchId=${batchId}`);await expect(page.getByText("SKU: VTK-00623",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"NONE OF THESE ARE INCLUDED"}).click();await page.getByTestId("btn-condition-A").click();await expect(page.getByTestId("btn-save-next")).toBeEnabled();await page.waitForTimeout(800);
  await page.reload();await expect(page.getByText("SKU: VTK-00623",{exact:true})).toBeVisible();await expect(page.getByTestId("btn-save-next")).toBeEnabled();
  await page.getByTestId("btn-save-next").click();await expect(page.getByText("Item 2 of 8")).toBeVisible({timeout:5000});
  for(let index=0;index<7;index+=1){await page.keyboard.press("F2");if(index<6)await expect(page.getByText(`Item ${index+3} of 8`)).toBeVisible({timeout:5000});}
  await expect(page.getByRole("heading",{name:"Batch Complete"})).toBeVisible({timeout:5000});await page.reload();await expect(page.getByRole("heading",{name:"Batch Complete"})).toBeVisible();
  const progress=await request.get(`http://127.0.0.1:4174/api/batches/${batchId}/progress`,{headers:{"x-development-user":"development-employee"}});expect(await progress.json()).toMatchObject({totalItemCount:8,completedCount:1,reviewCount:7,processedCount:8,pendingCount:0,percent:100,complete:true});
  const state=await pool.query<{status:string}>("select status from batches where id=$1",[batchId]);expect(state.rows[0].status).toBe("completed");
  const audit=await pool.query<{action:string;count:string}>("select action,count(*)::text as count from audit_events where batch_id=$1 group by action",[batchId]);const counts=Object.fromEntries(audit.rows.map((row)=>[row.action,Number(row.count)]));expect(counts).toMatchObject({batch_import_created:1,item_draft_saved:1,employee_answer_saved:1,needs_review_selected:7,batch_completed:1});
});
