import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,execSql,transaction} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent} from './shared.js';
import {executionEvent} from './execution-shared.js';
import {isValidDateTime,wouldCycle} from './execution-rules.js';

const editor=allow('owner','admin','finance','planner','sales');
const datetime=z.string().refine(isValidDateTime,'Tanggal dan jam harus valid.');
const inputSchema=z.object({start_at:datetime.nullable().optional(),due_at:datetime.nullable().optional(),
  depends_on_task_id:z.number().int().positive().nullable().optional()}).strict();

export function registerExecutionTimeline(router:Router){
  router.get('/:id/timeline',wrap(async(req,res)=>{
    const eventId=id(req.params.id);
    const event=await executionEvent(eventId);
    const tasks=await rows<any>(`SELECT t.id,t.title,t.category,t.due_at,t.assigned_to,t.status,t.priority,
      s.start_at,s.depends_on_task_id FROM tasks t LEFT JOIN project_task_schedules s ON s.task_id=t.id
      WHERE t.event_id=? ORDER BY t.due_at IS NULL,t.due_at,t.id LIMIT 400`,[eventId]);
    res.json({event,tasks});
  }));
  router.patch('/:id/timeline/:taskId',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),taskId=id(req.params.taskId),input=inputSchema.parse(req.body);
    if(!Object.keys(input).length)throw new Error('Tidak ada perubahan jadwal.');
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [task]=await rows<{id:number;due_at:string|null}>(
        'SELECT id,due_at FROM tasks WHERE id=? AND event_id=? FOR UPDATE',[taskId,eventId],conn);
      if(!task)throw new Error('Checklist tidak ditemukan dalam wedding ini.');
      const [current]=await rows<{start_at:string|null;depends_on_task_id:number|null}>(
        'SELECT start_at,depends_on_task_id FROM project_task_schedules WHERE task_id=? FOR UPDATE',[taskId],conn);
      const start=input.start_at===undefined?current?.start_at??null:input.start_at;
      const finish=input.due_at===undefined?task.due_at:input.due_at;
      if(start&&(!finish||!isValidDateTime(finish)||start>finish))
        throw new Error('Awal aktivitas tidak boleh melewati tenggat selesai.');
      const predecessor=input.depends_on_task_id===undefined?current?.depends_on_task_id??null:input.depends_on_task_id;
      if(predecessor!==null){
        const [parent]=await rows('SELECT id FROM tasks WHERE id=? AND event_id=?',[predecessor,eventId],conn);
        if(!parent)throw new Error('Dependensi harus berasal dari wedding yang sama.');
      }
      const links=await rows<{task_id:number;depends_on_task_id:number|null}>(`SELECT s.task_id,s.depends_on_task_id
        FROM project_task_schedules s JOIN tasks t ON t.id=s.task_id WHERE t.event_id=?`,[eventId],conn);
      const map=new Map(links.map(v=>[Number(v.task_id),v.depends_on_task_id===null?null:Number(v.depends_on_task_id)]));
      map.set(taskId,predecessor);
      if(wouldCycle(taskId,predecessor,map))throw new Error('Dependensi membentuk siklus. Pilih pekerjaan sebelumnya yang lain.');
      if(predecessor!==null){
        const [parent]=await rows<{due_at:string|null}>('SELECT due_at FROM tasks WHERE id=? AND event_id=?',[predecessor,eventId],conn);
        if(!start||!parent?.due_at||start<parent.due_at)
          throw new Error('Pekerjaan ini harus dimulai setelah tenggat aktivitas yang menjadi dependensinya.');
      }
      const successors=await rows<{start_at:string|null}>(`SELECT s.start_at FROM project_task_schedules s
        JOIN tasks t ON t.id=s.task_id WHERE t.event_id=? AND s.depends_on_task_id=?`,[eventId,taskId],conn);
      if(successors.some(item=>!finish||!item.start_at||item.start_at<finish))
        throw new Error('Tenggat ini berbenturan dengan aktivitas lanjutan yang bergantung padanya.');
      if(input.due_at!==undefined)await execSql('UPDATE tasks SET due_at=? WHERE id=?',[finish,taskId],conn);
      await execSql(`INSERT INTO project_task_schedules(task_id,start_at,depends_on_task_id,updated_by) VALUES(?,?,?,?)
        ON DUPLICATE KEY UPDATE start_at=VALUES(start_at),depends_on_task_id=VALUES(depends_on_task_id),
        updated_by=VALUES(updated_by)`,[taskId,start,predecessor,req.identity!.id],conn);
      await auditProject(conn,eventId,'schedule_update','tasks',taskId,req.identity!.id,
        `Mulai: ${start??'-'}; Akhir: ${finish??'-'}; Dependensi: ${predecessor??'-'}`);
    });res.json({ok:true});
  }));
}
