import {Router,type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import {rows,execSql} from './db.js';
import {allow} from './auth.js';

export const taskDocumentsRouter=Router();
const editor=allow('owner','admin','planner','sales');
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{
  Promise.resolve(fn(req,res)).catch(next);
};
const taskId=(raw:string)=>{const n=Number(raw);if(!Number.isSafeInteger(n)||n<1)throw new Error('ID tugas tidak valid.');return n;};
const photo=z.object({name:z.string().trim().min(1).max(140),mime:z.enum(['image/jpeg','image/png','image/webp']),
  data:z.string().max(1_200_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)});
const schema=z.object({mom:z.string().max(20000),photos:z.array(photo).max(4)});

taskDocumentsRouter.get('/:id/documents',wrap(async(req,res)=>{
  const id=taskId(req.params.id);
  const [task]=await rows('SELECT id FROM tasks WHERE id=?',[id]);
  if(!task){res.status(404).json({message:'Checklist tidak ditemukan.'});return;}
  const [doc]=await rows<{mom_text:string;photos_json:string}>('SELECT mom_text,photos_json FROM task_documents WHERE task_id=?',[id]);
  res.json({mom:doc?.mom_text||'',photos:doc?JSON.parse(doc.photos_json||'[]'):[]});
}));

taskDocumentsRouter.put('/:id/documents',editor,wrap(async(req,res)=>{
  const id=taskId(req.params.id),input=schema.parse(req.body);
  if(input.photos.some(x=>Buffer.byteLength(x.data,'utf8')>1_200_000))throw new Error('Foto terlalu besar. Maksimum sekitar 800 KB per foto.');
  const [task]=await rows<{status:string}>(`SELECT e.status FROM tasks t JOIN events e ON e.id=t.event_id WHERE t.id=?`,[id]);
  if(!task){res.status(404).json({message:'Checklist tidak ditemukan.'});return;}
  if(task.status==='cancelled'||task.status==='completed')throw new Error('Wedding selesai/dibatalkan. Dokumentasi historis hanya dapat dibaca.');
  await execSql(`INSERT INTO task_documents(task_id,mom_text,photos_json) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE mom_text=VALUES(mom_text),photos_json=VALUES(photos_json)`,
  [id,input.mom,JSON.stringify(input.photos)]);
  res.json({ok:true});
}));
