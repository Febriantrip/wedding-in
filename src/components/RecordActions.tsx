import {Pencil, Ban, Trash2} from 'lucide-react';
import './record-actions.css';

type Props={onEdit?:()=>void;onCancel?:()=>void;onDelete?:()=>void;cancelLabel?:string;disabled?:boolean};

export default function RecordActions({onEdit,onCancel,onDelete,cancelLabel='Batalkan',disabled=false}:Props){
  return <div className="record-actions" onClick={event=>event.stopPropagation()}>
    {onEdit&&<button type="button" disabled={disabled} onClick={onEdit} title="Edit data"><Pencil size={14}/> Edit</button>}
    {onCancel&&<button type="button" disabled={disabled} className="record-action-cancel" onClick={onCancel} title={cancelLabel}><Ban size={14}/> {cancelLabel}</button>}
    {onDelete&&<button type="button" disabled={disabled} className="record-action-delete" onClick={onDelete} title="Hapus data"><Trash2 size={14}/> Hapus</button>}
  </div>;
}
