import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
router.get("/readyz", async (req,res)=>{if(process.env.APP_ENV!=="staging"){res.json({status:"ok"});return;}try{const {pool}=await import("@workspace/db");await pool.query("select 1");res.json({status:"ready"});return;}catch{res.status(503).json({code:"SYSTEM_ERROR",message:"Database is not ready.",correlationId:req.correlationId});return;}});

export default router;
