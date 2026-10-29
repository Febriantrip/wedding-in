import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,execSql,transaction} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {appointmentOn,cloneTemplate,type GuideSection,type RunTemplate} from './rundown-template-data.js';
import {wrap,id,openEvent} from './shared.js';

const editor=allow('owner','admin','finance','planner','sales');
const fieldsSchema=z.object({key:z.string().min(1).max(90),label:z.string().min(1).max(180),value:z.string().max(1200)}).strict();
const sectionsSchema=z.array(z.object({id:z.string().min(1).max(60),title:z.string().min(1).max(180),fields:z.array(fieldsSchema).max(35)}).strict()).min(1).max(15);

export function matchesGuide(source:GuideSection[],edited:GuideSection[]){
  return source.length===edited.length&&source.every((section,index)=>section.id===edited[index]?.id&&
    section.title===edited[index]?.title&&section.fields.length===edited[index]?.fields.length&&
    section.fields.every((field,i)=>field.key===edited[index].fields[i]?.key&&field.label===edited[index].fields[i]?.label));
}
const parseJson=(raw:unknown)=>JSON.parse(String(raw)) as RunTemplate;

export function registerRundownTemplates(router:Router){
  router.get('/rundown-templates',wrap(async(_req,res)=>{
    res.json({templates:await rows('SELECT id,code,title,version_no FROM rundown_templates WHERE active=1 ORDER BY id')});
  }));
  router.get('/:id/rundown-profile',wrap(async(req,res)=>{
    const eventId=id(req.params.id);
    const [event]=await rows('SELECT id FROM events WHERE id=?',[eventId]);
    if(!event)throw new Error('Wedding tidak ditemukan.');
    const [profile]=await rows<{id:number;template_id:number;profile_json:string;title:string;version_no:number}>(
      `SELECT p.id,p.template_id,p.profile_json,t.title,t.version_no FROM event_rundown_profiles p
       JOIN rundown_templates t ON t.id=p.template_id WHERE p.event_id=?`,[eventId]);
    res.json({profile:profile?{id:profile.id,template_id:profile.template_id,sections:JSON.parse(profile.profile_json),
      template_title:profile.title,template_version:profile.version_no}:null});
  }));
  router.post('/:id/rundown/apply-template',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({template_id:z.number().int().positive()}).strict().parse(req.body);
    const inserted=await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [existing]=await rows('SELECT id FROM event_rundown_profiles WHERE event_id=? FOR UPDATE',[eventId],conn);
      if(existing)throw new Error('Wedding ini sudah memiliki salinan template. Template asli tidak boleh ditimpa.');
      const [anyItems]=await rows('SELECT id FROM event_rundown_items WHERE event_id=? LIMIT 1 FOR UPDATE',[eventId],conn);
      const [master]=await rows<{payload_json:string}>(
        'SELECT payload_json FROM rundown_templates WHERE id=? AND active=1',[input.template_id],conn);
      if(!master)throw new Error('Template master tidak tersedia.');
      const source=parseJson(master.payload_json);
      const [event]=await rows<{event_date:string;venue:string;client_name:string;partner_name:string}>(
        `SELECT e.event_date,e.venue,c.name client_name,c.partner_name FROM events e
         LEFT JOIN clients c ON c.id=e.client_id WHERE e.id=?`,[eventId],conn);
      if(!event)throw new Error('Wedding tidak ditemukan.');
      const day=String(event.event_date).slice(0,10);
      const guide=cloneTemplate(source,{date:day,venue:event.venue??'',bride:event.client_name?.replace(/^DEMO\s*\|\s*/,'')??'',
        groom:event.partner_name??''});
      const profile=await execSql(`INSERT INTO event_rundown_profiles
        (event_id,template_id,profile_json,created_by) VALUES (?,?,?,?)`,
        [eventId,input.template_id,JSON.stringify(guide),req.identity!.id],conn);
      if(!anyItems){
        for(const row of source.rows){
          await execSql(`INSERT INTO event_rundown_items
            (event_id,title,segment,planned_start,planned_end,notes,run_detail,pic_text,technical_note,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,[eventId,row.title,row.segment,appointmentOn(day,row.start),
            appointmentOn(day,row.end),'',row.detail,row.pic,row.technical,req.identity!.id],conn);
        }
      }
      await auditProject(conn,eventId,'rundown_template_applied','event_rundown_profiles',profile.insertId,
        req.identity!.id,`Salinan master #${input.template_id}, ${anyItems?'rundown existing dipertahankan':source.rows.length+' kegiatan'}`);
      return {id:profile.insertId,count:anyItems?0:source.rows.length,preserved_existing:Boolean(anyItems)};
    });res.status(201).json(inserted);
  }));
  router.patch('/:id/rundown-profile',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({sections:sectionsSchema}).strict().parse(req.body);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [profile]=await rows<{id:number;profile_json:string}>(
        'SELECT id,profile_json FROM event_rundown_profiles WHERE event_id=? FOR UPDATE',[eventId],conn);
      if(!profile)throw new Error('Terapkan master rundown terlebih dahulu.');
      const source=JSON.parse(profile.profile_json) as GuideSection[];
      if(!matchesGuide(source,input.sections))throw new Error('Struktur panduan tidak boleh diubah. Hanya isi setiap field yang dapat diedit.');
      await execSql('UPDATE event_rundown_profiles SET profile_json=?,updated_by=? WHERE id=?',
        [JSON.stringify(input.sections),req.identity!.id,profile.id],conn);
      await auditProject(conn,eventId,'rundown_profile_update','event_rundown_profiles',profile.id,
        req.identity!.id,'Panduan wedding diedit tanpa mengubah master template.');
    });res.json({ok:true});
  }));
}
