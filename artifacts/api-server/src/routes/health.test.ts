import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHealthRouter } from "./health";
import { correlationId } from "../middleware/security";

async function status(check:()=>Promise<void>){const prior=process.env.APP_ENV;process.env.APP_ENV="staging";const app=express().use(correlationId).use(createHealthRouter(check));const server=await new Promise<import("node:http").Server>((resolve)=>{const value=app.listen(0,"127.0.0.1",()=>resolve(value));});try{const address=server.address();assert.ok(address&&typeof address==="object");return await fetch(`http://127.0.0.1:${address.port}/readyz`);}finally{if(prior===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=prior;await new Promise<void>((resolve)=>server.close(()=>resolve()));}}

test("readyz reports healthy database and rejects unavailable database while health remains independent",async()=>{assert.equal((await status(async()=>{})).status,200);const unavailable=await status(async()=>{throw new Error("database down");});assert.equal(unavailable.status,503);const body=await unavailable.json() as {code:string};assert.equal(body.code,"SYSTEM_ERROR");});
