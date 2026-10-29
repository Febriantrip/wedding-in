import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,execSql,transaction,type DbConn} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent,required} from './shared.js';
import {executionEvent} from './execution-shared.js';

const editor=allow('owner','admin','finance','planner','sales');
type Kind='crew'|'vendor';
const state=z.enum(['expected','arrived','ready','departed']);
const allowed:Record<string,string[]>={expected:['arrived'],arrived:['ready','departed'],ready:['departed'],departed:[]};

async function assigned(conn:DbConn,eventId:number,kind:Kind,assignmentId:number){
  const table=kind==='crew'?'event_staff':'event_vendors';
  const [record]=await rows(`SELECT id FROM ${table} WHERE id=? AND event_id=?`,[assignmentId,eventId],conn);
  if(!record)throw new Error('Penugasan crew/vendor tidak ditemukan untuk wedding ini.');
}
async function team(eventId:number){
  const [crew,vendors,presence]=await Promise.all([
    rows<any>(`SELECT es.id assignment_id,s.name,s.position,es.assignment FROM event_staff es
      JOIN staff s ON s.id=es.staff_id WHERE es.event_id=? ORDER BY s.name`,[eventId]),
    rows<any>(`SELECT ev.id assignment_id,v.name,ev.service_name,ev.status booking_status
      FROM event_vendors ev JOIN vendors v ON v.id=ev.vendor_id
      WHERE ev.event_id=? AND ev.status<>'cancelled' ORDER BY v.name`,[eventId]),
    rows<any>(`SELECT team_kind,assignment_id,state,arrived_at,ready_at,departed_at,note
      FROM event_team_presence WHERE event_id=?`,[eventId])
  ]);
  const get=(kind:Kind,assignmentId:number)=>presence.find(p=>p.team_kind===kind&&Number(p.assignment_id)===assignmentId);
  return {crew:crew.map(item=>({...item,kind:'crew',presence:get('crew',Number(item.assignment_id))??null})),
    vendors:vendors.map(item=>({...item,kind:'vendor',presence:get('vendor',Number(item.assignment_id))??null}))};
}

export function registerFieldMonitor(router:Router){
  router.get('/:id/team',wrap(async(req,res)=>{
    const eventId=id(req.params.id),event=await executionEvent(eventId);
    res.json({event,...await team(eventId)});
  }));
  router.post('/:id/team/:kind/:assignmentId',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),kind=z.enum(['crew','vendor']).parse(req.params.kind),assignmentId=id(req.params.assignmentId),
      input=z.object({state,note:z.string().trim().max(350).default('')}).strict().parse(req.body);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      await assigned(conn,eventId,kind,assignmentId);
      const [prior]=await rows<{state:string}>(`SELECT state FROM event_team_presence WHERE event_id=?
        AND team_kind=? AND assignment_id=? FOR UPDATE`,[eventId,kind,assignmentId],conn);
      const old=prior?.state??'expected';
      if(old===input.state)throw new Error('Status kehadiran sudah sama.');
      if(!allowed[old]?.includes(input.state))throw new Error(`Transisi kehadiran ${old} menjadi ${input.state} tidak diizinkan.`);
      await execSql(`INSERT INTO event_team_presence(event_id,team_kind,assignment_id,state,note,updated_by,
        arrived_at,ready_at,departed_at) VALUES (?,?,?,?,?,?,
        IF(?='arrived',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL),
        IF(?='ready',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL),
        IF(?='departed',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL))
        ON DUPLICATE KEY UPDATE state=VALUES(state),note=VALUES(note),updated_by=VALUES(updated_by),
        arrived_at=COALESCE(arrived_at,IF(VALUES(state)='arrived',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL)),
        ready_at=COALESCE(ready_at,IF(VALUES(state)='ready',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL)),
        departed_at=COALESCE(departed_at,IF(VALUES(state)='departed',UTC_TIMESTAMP()+INTERVAL 7 HOUR,NULL))`,
        [eventId,kind,assignmentId,input.state,input.note,req.identity!.id,input.state,input.state,input.state],conn);
      await auditProject(conn,eventId,'presence_update','event_team_presence',assignmentId,req.identity!.id,
        `${kind}: ${old} -> ${input.state}${input.note?'; '+input.note:''}`);
    });res.json({ok:true});
  }));
  router.get('/:id/incidents',wrap(async(req,res)=>{
    const eventId=id(req.params.id),event=await executionEvent(eventId);
    const incidents=await rows<any>(`SELECT i.*,u.name reporter_name,r.name resolver_name
      FROM event_incidents i JOIN users u ON u.id=i.created_by LEFT JOIN users r ON r.id=i.resolved_by
      WHERE i.event_id=? ORDER BY (i.status='open') DESC,(i.severity='high') DESC,i.id DESC LIMIT 200`,[eventId]);
    res.json({event,incidents});
  }));
  router.post('/:id/incidents',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({title:required.max(180),description:required.min(8).max(800),
      severity:z.enum(['low','medium','high']),rundown_item_id:z.number().int().positive().nullable()}).strict().parse(req.body);
    const added=await transaction(async conn=>{
      await openEvent(conn,eventId);
      if(input.rundown_item_id!==null){const [target]=await rows('SELECT id FROM event_rundown_items WHERE event_id=? AND id=?',
        [eventId,input.rundown_item_id],conn);if(!target)throw new Error('Aktivitas rundown tidak ditemukan.');}
      const created=await execSql(`INSERT INTO event_incidents(event_id,title,description,severity,rundown_item_id,created_by)
        VALUES (?,?,?,?,?,?)`,[eventId,input.title,input.description,input.severity,input.rundown_item_id,req.identity!.id],conn);
      await auditProject(conn,eventId,'incident_open','event_incidents',created.insertId,req.identity!.id,input.title);
      return created.insertId;
    });res.status(201).json({id:added});
  }));
  router.post('/:id/incidents/:incidentId/resolve',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),incidentId=id(req.params.incidentId),
      input=z.object({resolution:required.min(8).max(800)}).strict().parse(req.body);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [item]=await rows<{status:string}>('SELECT status FROM event_incidents WHERE id=? AND event_id=? FOR UPDATE',[incidentId,eventId],conn);
      if(!item||item.status!=='open')throw new Error('Kendala tidak ditemukan atau sudah diselesaikan.');
      await execSql(`UPDATE event_incidents SET status='resolved',resolution=?,resolved_by=?,
        resolved_at=UTC_TIMESTAMP()+INTERVAL 7 HOUR WHERE id=?`,[input.resolution,req.identity!.id,incidentId],conn);
      await auditProject(conn,eventId,'incident_resolve','event_incidents',incidentId,req.identity!.id,input.resolution);
    });res.json({ok:true});
  }));
  router.get('/:id/monitor',wrap(async(req,res)=>{
    const eventId=id(req.params.id),event=await executionEvent(eventId);
    const [rundown,incidents,coordination]=await Promise.all([
      rows<any>(`SELECT id,title,planned_start,planned_end,actual_start,actual_end,status,segment
        FROM event_rundown_items WHERE event_id=? ORDER BY planned_start,id LIMIT 500`,[eventId]),
      rows<any>(`SELECT id,title,severity,status,created_at FROM event_incidents WHERE event_id=?
        ORDER BY (status='open') DESC,id DESC LIMIT 60`,[eventId]),team(eventId)
    ]);
    res.json({event,rundown,incidents,...coordination});
  }));
}
