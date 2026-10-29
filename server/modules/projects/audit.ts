import {execSql,type DbConn} from '../../db.js';

export async function auditProject(conn:DbConn,eventId:number,action:string,targetType:string,targetId:number,userId:number,note:string=''){
  await execSql('INSERT INTO event_project_audits(event_id,action,target_type,target_id,actor_id,note) VALUES (?,?,?,?,?,?)',
    [eventId,action,targetType,targetId,userId,note.slice(0,350)],conn);
}
