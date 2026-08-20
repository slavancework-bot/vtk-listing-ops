import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { NonproductionFilesystemStorage } from "./file-storage";

test("filesystem storage uses generated contained keys, removes exactly its file, and is production-forbidden",async()=>{const root=await mkdtemp(join(tmpdir(),"vtk-storage-"));const old={node:process.env.NODE_ENV,app:process.env.APP_ENV,allow:process.env.ALLOW_NONPRODUCTION_STORAGE};try{process.env.NODE_ENV="test";process.env.APP_ENV="staging";process.env.ALLOW_NONPRODUCTION_STORAGE="true";const storage=new NonproductionFilesystemStorage(root);const stored=await storage.store(Buffer.from("safe"));assert.match(stored.key,/^[0-9a-f-]{36}\.csv$/);const target=resolve(root,stored.key);assert.ok(target.startsWith(`${resolve(root)}${sep}`));assert.equal(await readFile(target,"utf8"),"safe");await stored.remove();await assert.rejects(()=>readFile(target));process.env.APP_ENV="production";assert.throws(()=>new NonproductionFilesystemStorage(root),/forbidden/);}finally{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key.toUpperCase()==="NODE"?"NODE_ENV":key.toUpperCase()==="APP"?"APP_ENV":"ALLOW_NONPRODUCTION_STORAGE"];else if(key==="node")process.env.NODE_ENV=value;else if(key==="app")process.env.APP_ENV=value;else process.env.ALLOW_NONPRODUCTION_STORAGE=value;}await rm(root,{recursive:true,force:true});}});
