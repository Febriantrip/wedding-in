import {rows} from '../../db.js';

export async function executionEvent(eventId:number){
  const [event]=await rows<{id:number;title:string;event_date:string;status:string}>(
    'SELECT id,title,event_date,status FROM events WHERE id=?',[eventId]);
  if(!event)throw new Error('Wedding tidak ditemukan.');
  return event;
}
