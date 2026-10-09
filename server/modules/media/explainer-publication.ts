import { z } from 'zod';
import { pool } from '../../db';
import { AudioError } from './audio';
import { verifyAccount, youtubeAccess, PublishError } from './providers';
import { ownedYouTubePlaylist } from './youtube-playlists';
import { schedulePublications } from './scheduling';
import { loadMscPackage, MSC_PACKAGE } from './explainer-package';
const CHANNEL='UCU-0JeoKAGUIYCNMtiyc2Tg';
const PLAYLIST='PLbs1Yk6LVu5Q';
const idsSchema=z.array(z.string().uuid()).length(9);
export async function queueMscPublication(c:any, ids:string[]) {
  idsSchema.parse(ids);
  const existing=(await c.query("SELECT id,status,payload FROM media_jobs WHERE kind='msc_publication' AND payload->>'package_id'=$1 ORDER BY created_at DESC FOR UPDATE",[MSC_PACKAGE])).rows[0];
  if(existing){
    if(JSON.stringify(existing.payload.post_ids)!==JSON.stringify(ids))throw new AudioError(409,"Paketdagi eski darslar almashgan. Nashr buyruqlarini tekshiring.");
    if(existing.status==='failed')await c.query("UPDATE media_jobs SET status='queued',error=NULL WHERE id=$1",[existing.id]);
    return existing.id;
  }
  return (await c.query("INSERT INTO media_jobs(kind,payload) VALUES('msc_publication',$1) RETURNING id",[JSON.stringify({package_id:MSC_PACKAGE,post_ids:ids})])).rows[0].id;
}
export function publicationVariants(post:any, videoId:string, accountId:string, position:number) {
  const variants={...post.variants};
  const caption=variants.telegram||post.caption;
  variants.telegram_format='article';
  variants.telegram=caption.includes('{{asset:')?caption:`<video src="{{asset:${videoId}}}"></video>\n${caption}`;
  variants.telegram_asset_ids=[videoId];variants.youtube_asset_ids=[videoId];
  variants.youtube_privacy='public';
  variants.youtube_playlist={account_id:accountId,playlist_id:PLAYLIST,position,title:'Milliy sertifikat — arab tili og‘zaki qo‘llanma'};
  return variants;
}
export function missingPublicationAccounts(deliveries:{account_id:string;status:string}[], ids:string[]) {
  if(deliveries.some(d=>ids.includes(d.account_id)&&d.status==='cancelled'))throw new AudioError(409,'Bekor qilingan nashr bor. Avtomatik qayta yoqilmaydi.');
  return ids.filter(id=>!deliveries.some(d=>d.account_id===id));
}
let busy=false;
export async function processMscPublication() {
  if(busy)return;busy=true;
  let lease:any,locked=false,job:any;
  try {
    lease=await pool.connect();locked=Boolean((await lease.query('SELECT pg_try_advisory_lock(761284) AS locked')).rows[0].locked);if(!locked)return;
    job=(await pool.query("SELECT * FROM media_jobs WHERE kind='msc_publication' AND status IN ('queued','running') ORDER BY created_at LIMIT 1")).rows[0];if(!job)return;
    const ids=idsSchema.parse(job.payload.post_ids),items=await loadMscPackage();
    const posts=(await pool.query('SELECT * FROM media_posts WHERE id=ANY($1::uuid[])',[ids])).rows;
    if(posts.length!==9)throw new AudioError(409,'Paketdagi dars o‘chirilgan. Nashr rejalashtirilmadi.');
    const ordered=items.map(i=>posts.find(p=>p.variants.explainer?.lesson_code===i.plan.lesson_code));
    if(ordered.some(p=>!p))throw new AudioError(409,'Paket dars kodlari mos emas.');
    if(ordered.some(p=>!p.variants.explainer_video_id)){
      const failed=(await pool.query("SELECT 1 FROM media_jobs WHERE kind='explainer' AND status='failed' AND payload->>'post_id'=ANY($1::text[])",[ids])).rowCount;
      if(failed)throw new AudioError(409,'Dars yaratishda xato bor. Videolar tugamagani sabab nashr rejalashtirilmadi.');
      return;
    }
    // Never turn a missed slot into an unexpected immediate publication.
    if(items.some(i=>new Date(i.publication.planned_at).getTime()<=Date.now()))throw new AudioError(409,'Nashr vaqti o‘tgan. Yangi jadval belgilang; hozir avtomatik yuborilmadi.');
    await pool.query("UPDATE media_jobs SET status='running',started_at=now() WHERE id=$1",[job.id]);
    const accounts=(await pool.query("SELECT * FROM media_accounts WHERE enabled AND verified_at IS NOT NULL AND platform IN ('telegram','youtube')")).rows;
    const tg=await verifyAccount({id:'requested',platform:'telegram',external_id:'@zamonaviymedia',credentials:null});
    const telegram=accounts.filter(a=>a.platform==='telegram'&&a.external_id===tg.external_id);
    const youtube=accounts.filter(a=>a.platform==='youtube'&&a.external_id===CHANNEL);
    if(telegram.length!==1||youtube.length!==1)throw new AudioError(422,'Platformalar bo‘limida @zamonaviymedia va Umidjon Abdurayimov YouTube hisobini tekshirib ulang. Boshqa kanal tanlanmadi.');
    const ytIdentity=await verifyAccount(youtube[0]);if(ytIdentity.external_id!==CHANNEL)throw new AudioError(422,'Google ulanishi kerakli YouTube kanaliga mos emas.');
    const access=await youtubeAccess(youtube[0]);if(access.playlist_write!==true)throw new AudioError(422,'YouTube playlistga yozish ruxsati kerak. Platformalar bo‘limida Google orqali ulanishni yangilang.');
    const playlist=await ownedYouTubePlaylist(access.token,PLAYLIST,CHANNEL);
    const accountIds=[telegram[0].id,youtube[0].id];
    for(let n=0;n<ordered.length;n++){
      const post=ordered[n];
      const deliveries=(await pool.query('SELECT account_id,status FROM media_deliveries WHERE post_id=$1',[post.id])).rows;
      const missing=missingPublicationAccounts(deliveries,accountIds);if(!missing.length)continue;
      const variants=publicationVariants(post,post.variants.explainer_video_id,youtube[0].id,playlist.item_count+n+1);
      // An existing delivery retains its original playlist position on recovery.
      if(post.variants.youtube_playlist)variants.youtube_playlist=post.variants.youtube_playlist;
      await pool.query('UPDATE media_posts SET variants=$2,updated_at=now() WHERE id=$1',[post.id,JSON.stringify(variants)]);
      await schedulePublications([{post_id:post.id,scheduled_at:items[n].publication.planned_at}],missing);
    }
    await pool.query("UPDATE media_jobs SET status='completed',completed_at=now(),result=$2,error=NULL WHERE id=$1",[job.id,JSON.stringify({post_ids:ids})]);
    console.info("MSC publication scheduled: 9 lessons, Telegram and YouTube, Asia/Tashkent 14:00.");
  }catch(e){
    console.info("MSC publication blocked:",e instanceof AudioError||e instanceof PublishError?e.message:"Check publication job in the panel.");
    if(job)await pool.query("UPDATE media_jobs SET status='failed',error=$2,completed_at=now() WHERE id=$1",[job.id,e instanceof AudioError||e instanceof PublishError?e.message:e instanceof Error&&e.name==='ScheduleError'?e.message:'Avtomatik nashr rejalashtirilmadi. Ulanish va jadvalni tekshiring.']);
  }finally{if(locked)await lease.query('SELECT pg_advisory_unlock(761284)').catch(()=>{});lease?.release();busy=false;}
}
