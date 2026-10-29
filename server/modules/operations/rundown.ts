import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,execSql,transaction,type DbConn} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent,required} from './shared.js';
import {executionEvent} from './execution-shared.js';
import {isValidDateTime,validWindow} from './execution-rules.js';

const editor=allow('owner','admin','finance','planner','sales');
const datetime=z.string().refine(isValidDateTime,'Tanggal dan jam tidak valid.');
const dataSchema=z.object({title:required.max(180),segment:z.enum(['preparation','ceremony','reception','closing','other']),
  planned_start:datetime,planned_end:datetime,staff_assignment_id:z.number().int().positive().nullable(),
  vendor_assignment_id:z.number().int().positive().nullable(),notes:z.string().trim().max(600),
  run_detail:z.string().trim().max(1600).default(''),
  pic_text:z.string().trim().max(180).default(''),
  technical_note:z.string().trim().max(1600).default('')}).strict();

async function validateAssignments(conn:DbConn,eventId:number,staff:number|null,vendor:number|null){
  if(staff!==null){const [match]=await rows('SELECT id FROM event_staff WHERE id=? AND event_id=?',[staff,eventId],conn);
    if(!match)throw new Error('Crew harus ditugaskan ke wedding ini terlebih dahulu.');}
  if(vendor!==null){const [match]=await rows('SELECT id FROM event_vendors WHERE id=? AND event_id=? AND status<>\'cancelled\'',[vendor,eventId],conn);
    if(!match)throw new Error('Vendor harus ditugaskan ke wedding ini terlebih dahulu.');}
}

export function registerRundown(router:Router){
  router.get('/:id/rundown',wrap(async(req,res)=>{
    const eventId=id(req.params.id),event=await executionEvent(eventId);
    const [items,crew,vendors]=await Promise.all([
      rows<any>(`SELECT r.*,s.name crew_name,v.name vendor_name FROM event_rundown_items r
        LEFT JOIN event_staff es ON es.id=r.staff_assignment_id LEFT JOIN staff s ON s.id=es.staff_id
        LEFT JOIN event_vendors ev ON ev.id=r.vendor_assignment_id LEFT JOIN vendors v ON v.id=ev.vendor_id
        WHERE r.event_id=? ORDER BY r.planned_start,r.id LIMIT 500`,[eventId]),
      rows<any>(`SELECT es.id,s.name,s.position,es.assignment FROM event_staff es JOIN staff s ON s.id=es.staff_id
        WHERE es.event_id=? ORDER BY s.name`,[eventId]),
      rows<any>(`SELECT ev.id,v.name,ev.service_name FROM event_vendors ev JOIN vendors v ON v.id=ev.vendor_id
        WHERE ev.event_id=? AND ev.status<>'cancelled' ORDER BY v.name`,[eventId])
    ]);
    res.json({event,items,crew,vendors});
  }));
  router.post('/:id/rundown',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=dataSchema.parse(req.body);
    if(!validWindow(input.planned_start,input.planned_end))throw new Error('Durasi rundown harus lebih dari nol dan maksimal 24 jam.');
    const result=await transaction(async conn=>{
      await openEvent(conn,eventId);
      await validateAssignments(conn,eventId,input.staff_assignment_id,input.vendor_assignment_id);
      const inserted=await execSql(`INSERT INTO event_rundown_items(event_id,title,segment,planned_start,planned_end,
        staff_assignment_id,vendor_assignment_id,notes,run_detail,pic_text,technical_note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [eventId,input.title,input.segment,input.planned_start,input.planned_end,input.staff_assignment_id,
          input.vendor_assignment_id,input.notes,input.run_detail,input.pic_text,input.technical_note,req.identity!.id],conn);
      await auditProject(conn,eventId,'rundown_create','event_rundown_items',inserted.insertId,req.identity!.id,input.title);
      return inserted.insertId;
    });res.status(201).json({id:result});
  }));
  router.patch('/:id/rundown/:itemId',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),itemId=id(req.params.itemId),input=dataSchema.parse(req.body);
    if(!validWindow(input.planned_start,input.planned_end))throw new Error('Durasi rundown harus lebih dari nol dan maksimal 24 jam.');
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [old]=await rows<{status:string}>('SELECT status FROM event_rundown_items WHERE id=? AND event_id=? FOR UPDATE',[itemId,eventId],conn);
      if(!old)throw new Error('Rundown tidak ditemukan.');
      if(old.status!=='scheduled')throw new Error('Rundown yang sudah berjalan/selesai tidak boleh diubah jadwalnya.');
      await validateAssignments(conn,eventId,input.staff_assignment_id,input.vendor_assignment_id);
      await execSql(`UPDATE event_rundown_items SET title=?,segment=?,planned_start=?,planned_end=?,
        staff_assignment_id=?,vendor_assignment_id=?,notes=?,run_detail=?,pic_text=?,technical_note=?,updated_by=? WHERE id=?`,
        [input.title,input.segment,input.planned_start,input.planned_end,input.staff_assignment_id,
          input.vendor_assignment_id,input.notes,input.run_detail,input.pic_text,input.technical_note,req.identity!.id,itemId],conn);
      await auditProject(conn,eventId,'rundown_update','event_rundown_items',itemId,req.identity!.id,input.title);
    });res.json({ok:true});
  }));
  router.post('/:id/rundown/:itemId/state',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),itemId=id(req.params.itemId),input=z.object({
      state:z.enum(['ongoing','done','cancelled']),reason:z.string().trim().max(350).default('')}).strict().parse(req.body);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [item]=await rows<{status:string}>('SELECT status FROM event_rundown_items WHERE id=? AND event_id=? FOR UPDATE',[itemId,eventId],conn);
      if(!item)throw new Error('Rundown tidak ditemukan.');
      if(['done','cancelled'].includes(item.status))throw new Error('Rundown sudah final dan tidak boleh diubah.');
      if(input.state==='ongoing'&&item.status!=='scheduled')throw new Error('Kegiatan sudah berlangsung.');
      if(input.state==='cancelled'&&input.reason.length<8)throw new Error('Pembatalan rundown memerlukan alasan minimal 8 karakter.');
      if(input.state==='ongoing')await execSql(`UPDATE event_rundown_items SET status='ongoing',actual_start=UTC_TIMESTAMP()+INTERVAL 7 HOUR,
        updated_by=? WHERE id=?`,[req.identity!.id,itemId],conn);
      if(input.state==='done')await execSql(`UPDATE event_rundown_items SET status='done',
        actual_start=COALESCE(actual_start,UTC_TIMESTAMP()+INTERVAL 7 HOUR),actual_end=UTC_TIMESTAMP()+INTERVAL 7 HOUR,
        updated_by=? WHERE id=?`,[req.identity!.id,itemId],conn);
      if(input.state==='cancelled')await execSql(`UPDATE event_rundown_items SET status='cancelled',cancel_reason=?,
        updated_by=? WHERE id=?`,[input.reason,req.identity!.id,itemId],conn);
      await auditProject(conn,eventId,`rundown_${input.state}`,'event_rundown_items',itemId,req.identity!.id,input.reason||input.state);
    });res.json({ok:true});
  }));
  router.delete('/:id/rundown/:itemId',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),itemId=id(req.params.itemId);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [item]=await rows<{status:string}>('SELECT status FROM event_rundown_items WHERE id=? AND event_id=? FOR UPDATE',[itemId,eventId],conn);
      if(!item)throw new Error('Rundown tidak ditemukan.');
      if(item.status!=='scheduled')throw new Error('Hanya rundown yang belum berjalan yang boleh dihapus.');
      const [linked]=await rows('SELECT id FROM event_incidents WHERE rundown_item_id=? LIMIT 1',[itemId],conn);
      if(linked)throw new Error('Rundown ini memiliki histori kendala. Gunakan pembatalan dengan alasan.');
      await auditProject(conn,eventId,'rundown_delete','event_rundown_items',itemId,req.identity!.id,'Dihapus sebelum berjalan');
      await execSql('DELETE FROM event_rundown_items WHERE id=?',[itemId],conn);
    });res.json({ok:true});
  }));
}
