/** Panduan contoh diadaptasi dari susunan dokumen referensi; tidak membawa identitas/brand WO lain. */
export type GuideField={key:string;label:string;value:string};
export type GuideSection={id:string;title:string;fields:GuideField[]};
export type RunTemplateRow={segment:'preparation'|'ceremony'|'reception'|'closing';title:string;start:string;end:string;
  detail:string;pic:string;technical:string};
export type RunTemplate={version:number;sections:GuideSection[];rows:RunTemplateRow[]};

const fields=(values:[string,string,string?][]):GuideField[]=>values.map(([key,label,value])=>({key,label,value:value??''}));
export const defaultRunTemplate:RunTemplate={
  version:1,
  sections:[
    {id:'couple',title:'Data Calon Pengantin',fields:fields([
      ['bride_name','Nama calon pengantin wanita'],['bride_birth','Tempat / tanggal lahir CPW'],
      ['bride_child','Anak ke'],['bride_job','Pekerjaan CPW'],['bride_religion','Agama CPW'],
      ['bride_phone','Kontak CPW'],['bride_father','Nama ayah CPW'],['bride_mother','Nama ibu CPW'],
      ['bride_address','Alamat CPW'],['bride_siblings','Saudara kandung CPW'],
      ['groom_name','Nama calon pengantin pria'],['groom_birth','Tempat / tanggal lahir CPP'],
      ['groom_child','Anak ke CPP'],['groom_job','Pekerjaan CPP'],['groom_religion','Agama CPP'],
      ['groom_phone','Kontak CPP'],['groom_father','Nama ayah CPP'],['groom_mother','Nama ibu CPP'],
      ['groom_address','Alamat CPP'],['groom_siblings','Saudara kandung CPP']])},
    {id:'committee',title:'Kepanitiaan Acara',fields:fields([
      ['family_speech_bride','Sambutan keluarga CPW'],['family_speech_groom','Sambutan keluarga CPP'],
      ['qori','Qori / pembaca ayat'],['wali','Wali nikah'],['witness_bride','Saksi pihak CPW'],
      ['witness_groom','Saksi pihak CPP'],['kua','Penghulu / KUA'],['khutbah','Khutbah nikah'],
      ['reception_speech','Sambutan resepsi'],['mc','Master of Ceremony (MC)']])},
    {id:'vendors',title:'Vendor & Partner Acara',fields:fields([
      ['venue','Venue'],['catering','Catering'],['decoration','Dekorasi'],['documentation','Dokumentasi'],
      ['mua','Makeup Artist'],['attire','Busana pengantin'],['entertainment','Entertainment / musik'],
      ['organizer','Wedding Organizer','Wedding-In'],['seserahan','Seserahan'],['tradition','Kesenian / adat']])},
    {id:'info',title:'Informasi & Perlengkapan Acara',fields:fields([
      ['date','Tanggal acara'],['venue_address','Alamat venue'],['dresscode','Dresscode keluarga'],
      ['bride_attire','Busana mempelai'],['akad_guests','Tamu akad'],['reception_guests','Tamu resepsi'],
      ['pager_ayu','Pager ayu / bagus'],['souvenirs','Souvenir'],['doorprizes','Door prize'],
      ['buffet','Paket catering / pax'],['coffee_break','Coffee break'],['stalls','Gubukan / stall'],
      ['nasi_box','Nasi box'],['equipment','Perlengkapan / kotak hantaran']])},
    {id:'family',title:'Koordinasi Keluarga',fields:fields([
      ['bride_coordinator','Koordinator keluarga CPW'],['groom_coordinator','Koordinator keluarga CPP'],
      ['bride_pic','PIC keluarga CPW'],['groom_pic','PIC keluarga CPP'],
      ['guest_pic','PIC penerima tamu'],['gift_pic','PIC kotak amplop']])},
    {id:'vip',title:'Daftar Tamu VIP',fields:fields([
      ['vip_bride','VIP keluarga CPW (pisahkan dengan koma)'],
      ['vip_groom','VIP keluarga CPP (pisahkan dengan koma)'],
      ['vip_special','Tamu kehormatan / instansi (pisahkan dengan koma)']])}
  ],
  rows:[
    {segment:'preparation',title:'Makeup CPW',start:'04:00',end:'06:00',detail:'Persiapan rias dan busana pengantin wanita.',pic:'MUA / Attire',technical:'Morning call; pastikan makeup station siap.'},
    {segment:'preparation',title:'Makeup CPP',start:'04:00',end:'06:00',detail:'Persiapan rias dan busana pengantin pria.',pic:'MUA / Attire',technical:'Koordinasi lokasi rias CPP.'},
    {segment:'preparation',title:'Persiapan CPP',start:'06:00',end:'06:30',detail:'Pemeriksaan busana, keluarga, dan perlengkapan akad.',pic:'WO / keluarga',technical:'PIC pastikan CPP siap tepat waktu.'},
    {segment:'preparation',title:'Persiapan CPW',start:'06:00',end:'06:30',detail:'Pemeriksaan busana, keluarga, dan perlengkapan akad.',pic:'WO / keluarga',technical:'PIC pastikan CPW siap tepat waktu.'},
    {segment:'preparation',title:'Pengkondisian Keluarga',start:'06:30',end:'06:50',detail:'Keluarga dan petugas menempati posisi.',pic:'Floor Coordinator',technical:'Briefing terakhir dan cek audio.'},
    {segment:'ceremony',title:'Mapag Alit',start:'06:50',end:'07:00',detail:'Penyambutan rombongan pengantin pria.',pic:'MC / keluarga',technical:'Pastikan alur masuk dan dokumentasi siap.'},
    {segment:'ceremony',title:'Opening',start:'07:00',end:'07:05',detail:'Pembukaan rangkaian acara akad.',pic:'MC',technical:'Cue sound dan lighting.'},
    {segment:'ceremony',title:'Sambutan Keluarga',start:'07:05',end:'07:25',detail:'Sambutan dan penyerahan antar keluarga.',pic:'MC / perwakilan keluarga',technical:'Koordinasi mikrofon dan urutan pembicara.'},
    {segment:'ceremony',title:'Foto Simbolis Seserahan',start:'07:25',end:'07:30',detail:'Dokumentasi serah terima seserahan.',pic:'Dokumentasi',technical:'Area foto disiapkan sebelum segmen dimulai.'},
    {segment:'ceremony',title:'Pemanggilan CPP / Wali / Saksi / KUA',start:'07:30',end:'07:35',detail:'Mengondisikan pihak yang terlibat akad.',pic:'MC / KUA',technical:'Verifikasi posisi dan urutan kursi.'},
    {segment:'ceremony',title:'Qori',start:'07:35',end:'07:45',detail:'Pembacaan ayat suci.',pic:'Qori',technical:'Audio pengajian disiapkan.'},
    {segment:'ceremony',title:'Penyerahan Acara kepada KUA',start:'07:45',end:'07:50',detail:'MC mengalihkan prosesi kepada petugas.',pic:'MC / KUA',technical:'Penyesuaian alur atas arahan penghulu.'},
    {segment:'ceremony',title:'Khutbah Nikah',start:'07:50',end:'08:10',detail:'Nasihat dan khutbah nikah.',pic:'Penghulu / KUA',technical:'Koordinasi dokumentasi tanpa mengganggu prosesi.'},
    {segment:'ceremony',title:'Prosesi Akad Nikah',start:'08:10',end:'08:30',detail:'Ijab kabul, doa, dan penandatanganan.',pic:'Penghulu / saksi',technical:'Dokumen dan cincin dipastikan siap.'},
    {segment:'ceremony',title:'Sesi Dokumentasi',start:'08:30',end:'08:35',detail:'Dokumentasi resmi seusai akad.',pic:'Dokumentasi',technical:'Foto prioritas diambil terlebih dahulu.'},
    {segment:'ceremony',title:'Foto Keluarga',start:'08:35',end:'08:40',detail:'Foto kedua keluarga.',pic:'Dokumentasi / WO',technical:'PIC keluarga menyiapkan peserta foto.'},
    {segment:'ceremony',title:'Sungkeman',start:'08:40',end:'08:45',detail:'Prosesi sungkeman kepada orang tua.',pic:'MC / keluarga',technical:'Musik latar lembut dan blocking kamera.'},
    {segment:'ceremony',title:'Adat Sunda',start:'08:45',end:'09:30',detail:'Prosesi adat disesuaikan tradisi keluarga.',pic:'Tim adat / MC',technical:'Konfirmasi urutan dengan pembimbing adat.'},
    {segment:'ceremony',title:'Foto Couple',start:'09:30',end:'10:00',detail:'Sesi foto pasangan pengantin.',pic:'Dokumentasi',technical:'Lokasi foto dan pengaturan cahaya.'},
    {segment:'preparation',title:'Ganti Baju Resepsi',start:'10:00',end:'11:00',detail:'Persiapan busana resepsi; coffee break.',pic:'MUA / Attire',technical:'Pastikan busana dan konsumsi keluarga.'},
    {segment:'reception',title:'Wedding Entrance',start:'11:00',end:'11:20',detail:'Prosesi masuk pasangan pengantin.',pic:'MC / WO',technical:'Cue musik, lighting, dan jalur entrance.'},
    {segment:'reception',title:'Sambutan Resepsi',start:'11:20',end:'11:25',detail:'Sambutan keluarga saat resepsi.',pic:'MC / keluarga',technical:'Siapkan narasumber dan mikrofon.'},
    {segment:'reception',title:'Sesi Foto',start:'11:25',end:'11:30',detail:'Sesi foto resmi saat resepsi.',pic:'Dokumentasi',technical:'Atur urutan tamu prioritas.'},
    {segment:'reception',title:'Acara Resepsi',start:'11:30',end:'14:00',detail:'Penerimaan tamu, hiburan, dan ramah tamah.',pic:'Seluruh tim WO',technical:'Pantau alur tamu, catering, dan souvenir.'},
    {segment:'closing',title:'Penutupan',start:'14:00',end:'14:05',detail:'Penutupan acara oleh MC dan WO.',pic:'MC / WO',technical:'Pengondisian exit dan pengecekan barang.'}
  ]
};

export function cloneTemplate(template:RunTemplate,overrides:{bride?:string;groom?:string;date?:string;venue?:string}={}){
  const guide:GuideSection[]=JSON.parse(JSON.stringify(template.sections));
  const updated:Record<string,string>={bride_name:overrides.bride??'',groom_name:overrides.groom??'',
    date:overrides.date??'',venue:overrides.venue??''};
  for(const section of guide)for(const field of section.fields)if(Object.prototype.hasOwnProperty.call(updated,field.key))field.value=updated[field.key];
  return guide;
}

export function appointmentOn(date:string,clock:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(clock))throw new Error('Format tanggal template tidak valid.');
  return `${date} ${clock}:00`;
}
