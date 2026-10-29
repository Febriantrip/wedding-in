import {createHash} from 'node:crypto';
import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,execSql,transaction} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent} from './shared.js';

const finance=allow('owner','admin','finance');
const proof=z.object({file_name:z.string().trim().min(1).max(160),
  mime_type:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),
  data_base64:z.string().min(8).max(1_250_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();

function validFile(bytes:Buffer,mime:string){
  if(!bytes.length||bytes.length>900_000)throw new Error('Bukti transfer maksimal 900 KB.');
  const head=bytes.subarray(0,12);
  const ok=mime==='application/pdf'?head.subarray(0,5).toString()==='%PDF-':
    mime==='image/png'?head.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
    mime==='image/jpeg'?head.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):
    head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP';
  if(!ok)throw new Error('Isi file tidak sesuai tipe gambar/PDF yang dipilih.');
}

export function registerVendorPayments(router:Router){
  router.get('/:id/vendor-payments',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id);
    const [[event],bookings,bills,payments,proofs]=await Promise.all([
      rows<{id:number;status:string}>('SELECT id,status FROM events WHERE id=?',[eventId]),
      rows<any>(`SELECT ev.id assignment_id,ev.vendor_id,v.name vendor_name,ev.service_name,ev.agreed_price,
        b.booking_status,b.payment_responsibility,b.deposit_amount,b.deposit_due,b.final_due
        FROM event_vendors ev JOIN vendors v ON v.id=ev.vendor_id
        LEFT JOIN event_vendor_bookings b ON b.assignment_id=ev.id
        WHERE ev.event_id=? ORDER BY v.name`,[eventId]),
      rows<any>(`SELECT b.id,b.vendor_id,b.number,b.description,b.amount,b.due_date,
        EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel') cancelled
        FROM bills b WHERE b.event_id=? ORDER BY b.due_date,b.id`,[eventId]),
      rows<any>(`SELECT p.id,p.bill_id,p.amount,p.method,p.paid_at,p.reference,
        EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel') cancelled
        FROM bill_payments p JOIN bills b ON b.id=p.bill_id WHERE b.event_id=? ORDER BY p.paid_at DESC,p.id DESC`,[eventId]),
      rows<any>(`SELECT proof.id,proof.bill_payment_id,proof.file_name,proof.mime_type,proof.created_at,u.name uploader_name
        FROM project_vendor_payment_proofs proof JOIN bill_payments p ON p.id=proof.bill_payment_id
        JOIN bills b ON b.id=p.bill_id JOIN users u ON u.id=proof.uploaded_by
        WHERE b.event_id=? ORDER BY proof.id DESC`,[eventId])
    ]);
    if(!event){res.sendStatus(404);return;}
    res.json({event,bookings,bills,payments,proofs});
  }));

  router.post('/:id/vendor-payments/:paymentId/proofs',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id),paymentId=id(req.params.paymentId),input=proof.parse(req.body);
    const bytes=Buffer.from(input.data_base64,'base64');
    if(bytes.toString('base64').replace(/=+$/,'')!==input.data_base64.replace(/=+$/,''))
      throw new Error('Format encoding file tidak valid.');
    validFile(bytes,input.mime_type);
    const digest=createHash('sha256').update(bytes).digest('hex');
    const proofId=await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [payment]=await rows<any>(`SELECT p.id FROM bill_payments p JOIN bills b ON b.id=p.bill_id
        WHERE p.id=? AND b.event_id=? AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a
          WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel')
          AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel')
          AND NOT EXISTS(SELECT 1 FROM event_vendors ev JOIN event_vendor_bookings booking ON booking.assignment_id=ev.id
            WHERE ev.event_id=b.event_id AND ev.vendor_id=b.vendor_id AND booking.payment_responsibility='client_direct'
              AND booking.booking_status<>'cancelled') LIMIT 1`,[paymentId,eventId],conn);
      if(!payment)throw new Error('Pembayaran vendor tidak ditemukan atau tidak boleh dilampirkan.');
      const existing=await rows<{id:number;file_sha256:string}>('SELECT id,file_sha256 FROM project_vendor_payment_proofs WHERE bill_payment_id=? FOR UPDATE',[paymentId],conn);
      if(existing.length>=5)throw new Error('Maksimal lima versi bukti transfer untuk satu pembayaran.');
      if(existing.some(row=>row.file_sha256===digest))throw new Error('Bukti transfer dengan isi sama sudah tersimpan.');
      const entry=await execSql(`INSERT INTO project_vendor_payment_proofs
        (bill_payment_id,file_name,mime_type,data_base64,file_sha256,uploaded_by) VALUES (?,?,?,?,?,?)`,
        [paymentId,input.file_name,input.mime_type,input.data_base64,digest,req.identity!.id],conn);
      await auditProject(conn,eventId,'vendor_proof_add','project_vendor_payment_proofs',entry.insertId,req.identity!.id,input.file_name);
      return entry.insertId;
    });
    res.status(201).json({id:proofId});
  }));

  router.get('/:id/vendor-payments/proofs/:proofId',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id),proofId=id(req.params.proofId);
    const [record]=await rows<any>(`SELECT proof.id,proof.file_name,proof.mime_type,proof.data_base64
      FROM project_vendor_payment_proofs proof JOIN bill_payments p ON p.id=proof.bill_payment_id
      JOIN bills b ON b.id=p.bill_id WHERE b.event_id=? AND proof.id=?`,[eventId,proofId]);
    if(!record){res.sendStatus(404);return;}
    res.json(record);
  }));
}
