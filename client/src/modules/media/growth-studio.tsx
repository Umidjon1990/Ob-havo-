import { useEffect,useState } from 'react';
import { mediaApi,type MediaData,tashkentDate } from './api';
const initial={title:'',trigger:'comment',keywords:'LUG‘AT',action:'private_reply',response:'',media_id:'',enabled:false};
export default function GrowthStudio({data,onSaved}:{data:MediaData;onSaved:()=>Promise<void>}){
  const [state,setState]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [account,setAccount]=useState(data.accounts.find(a=>a.platform==='instagram')?.id||'');
  const [form,setForm]=useState(initial),[appSecret,setAppSecret]=useState(''),[verifyToken,setVerifyToken]=useState('');
  const [postId,setPostId]=useState(data.posts[0]?.id||''),[platform,setPlatform]=useState('instagram'),[quality,setQuality]=useState<any>(null),[review,setReview]=useState('');
  const [selectedEvent,setSelectedEvent]=useState(''),[reply,setReply]=useState('');
  async function reload(){setState(await mediaApi('/growth'));}
  useEffect(()=>{void reload().catch(e=>setError(e.message));},[]);
  async function perform(fn:()=>Promise<any>,message:string){setBusy(true);setError('');setNotice('');try{await fn();await reload();setNotice(message);}catch(e){setError(e instanceof Error?e.message:'Amal bajarilmadi.');}finally{setBusy(false);}}
  const input='media-input';
  const button=(label:string,fn:()=>void,disabled=busy)=> <button className="media-btn secondary" type="button" onClick={fn} disabled={disabled}>{label}</button>;
  return <div className="growth-studio">
    {error&&<div role="alert" className="media-alert">{error}</div>}{notice&&<div role="status" className="media-alert media-success">{notice}</div>}
    <section className="media-panel"><h2>Instagram agent</h2><p>Izohlar, Direct, statistika va sifat nazorati. Javob qoidalarini istalgan payt o‘chirishingiz mumkin.</p>
      <label className="media-field"><span>Instagram hisob</span><select className={input} value={account} onChange={e=>setAccount(e.target.value)}>{data.accounts.filter(a=>a.platform==='instagram').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <details><summary>Webhook ulanishini sozlash · {state?.webhook.configured?'Sirlar saqlangan':'Sozlanmagan'}</summary>
        <p>Meta ilovasining Webhooks bo‘limida shu callback manzilni kiriting:</p><code style={{overflowWrap:'anywhere'}}>{state?.webhook.url}</code>
        <p>Verify token: o‘zingiz belgilagan kamida 24 belgili tasodifiy qiymat. App Secret: aynan Instagramni ulagan Meta ilovangizdagi sir. Sirlar saqlangach qayta ko‘rsatilmaydi.</p>
        <label className="media-field"><span>Meta App Secret</span><input className={input} type="password" autoComplete="new-password" value={appSecret} onChange={e=>setAppSecret(e.target.value)} /></label>
        <label className="media-field"><span>Verify token</span><input className={input} type="password" autoComplete="new-password" value={verifyToken} onChange={e=>setVerifyToken(e.target.value)} /></label>
        <div className="media-actions">{button('Sirlarni saqlash',()=>void perform(async()=>{await mediaApi('/growth/webhook','PUT',{app_secret:appSecret,verify_token:verifyToken});setAppSecret('');setVerifyToken('');},'Webhook sirlarini saqladim.'),busy||appSecret.length<16||verifyToken.length<24)}
        {button('Hisobni webhookga ulash',()=>void perform(()=>mediaApi('/growth/subscribe','POST',{account_id:account}),'Hisob obunasi sozlandi.'),busy||!account||!state?.webhook.configured)}</div>
        <p>Meta’da comments va messages maydonlarini yoqing. Manage comments/messages ruxsatlari kerak. Sirlar saqlanishi webhook Meta’da tasdiqlanganini anglatmaydi; haqiqiy izoh va Direct bilan tekshiring.</p>
      </details>
    </section>
    <section className="media-panel"><h2>Kalit so‘z va Direct javoblari</h2><p>“LUG‘AT”, “KITOB”, “KURS” uchun havola yoki aniq javob yozing. Direct savollariga tasdiqlangan matnlar bilan javob beriladi; noma’lum savollar kiruvchi xabarlarda qoladi.</p>
      <form onSubmit={e=>{e.preventDefault();void perform(async()=>{await mediaApi('/growth/rules','POST',{...form,account_id:account,keywords:form.keywords.split(',').map(k=>k.trim()).filter(Boolean)});setForm(initial);},'Javob qoidasi qo‘shildi.');}}>
        <div className="media-form-grid">
          <label className="media-field"><span>Qoida nomi</span><input className={input} required maxLength={100} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label className="media-field"><span>Qayerdan keladi?</span><select className={input} value={form.trigger} onChange={e=>setForm({...form,trigger:e.target.value,action:e.target.value==='message'?'reply':'private_reply'})}><option value="comment">Izoh</option><option value="message">Direct</option></select></label>
          <label className="media-field"><span>Kalit so‘zlar (vergul bilan)</span><input className={input} required value={form.keywords} onChange={e=>setForm({...form,keywords:e.target.value})}/></label>
          <label className="media-field"><span>Amal</span><select className={input} value={form.action} onChange={e=>setForm({...form,action:e.target.value})}><option value="reply">Javob berish</option>{form.trigger==='comment'&&<><option value="private_reply">Directga material yuborish</option><option value="hide">Izohni yashirish</option></>}</select></label>
        </div>
        {form.trigger==='comment'&&<label className="media-field"><span>Faqat bitta post uchun Media ID (ixtiyoriy)</span><input className={input} pattern="[0-9]*" value={form.media_id} onChange={e=>setForm({...form,media_id:e.target.value})}/><small>Bo‘sh qolsa, hisobdagi yangi izohlarga qo‘llanadi.</small></label>}
        {form.action!=='hide'&&<label className="media-field"><span>Tayyor javob yoki material havolasi</span><textarea className={input} rows={4} required maxLength={1000} value={form.response} onChange={e=>setForm({...form,response:e.target.value})}/></label>}
        <label><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/> Saqlangach avtomatik ishlasin</label>
        <div className="media-actions"><button className="media-btn" disabled={busy||!account}>Qoida qo‘shish</button></div>
      </form>
      <p>Izohdan bir marta shaxsiy javob: 7 kun ichida. Direct avtomatik javobi: o‘quvchining xabaridan keyin 24 soat ichida. Bir nechta qoida mos kelsa, eng avval yaratilgani ishlaydi.</p>
      {state?.rules.map((r:any)=><div className="growth-row" key={r.id}><div><strong>{r.title}</strong><p>{r.trigger==='message'?'Direct':'Izoh'} · {r.keywords.join(', ')} · {r.response||'Yashirish'}</p></div><div className="media-actions">{button(r.enabled?'O‘chirish':'Yoqish',()=>void perform(()=>mediaApi(`/growth/rules/${r.id}`,'PATCH',{enabled:!r.enabled}),'Qoida yangilandi.'))}{button('Olib tashlash',()=>void perform(()=>mediaApi(`/growth/rules/${r.id}`,'DELETE'),'Qoida olib tashlandi.'))}</div></div>)}
    </section>
    <section className="media-panel"><div className="media-actions"><h2>Kiruvchi izohlar va Direct</h2>{button('Yangilash',()=>void perform(async()=>{},'Yangilandi.'))}</div>
      {!state?.events.length&&<p>Hali xabar yo‘q. Webhookni ulab, boshqa hisobdan izoh yoki Direct yuborib sinang.</p>}
      {state?.events.map((e:any)=><div className="growth-row" key={e.id}><div><strong>{e.kind==='comment'?'Izoh':'Direct'} · {e.account_name}</strong><p dir="auto">{e.text}</p><small>{tashkentDate(e.occurred_at)} · {e.status}{e.error&&` · ${e.error}`}</small>{e.response&&<p>Javob: {e.response}</p>}</div>{!['handled','processing','needs_review'].includes(e.status)&&button('Boshqarish',()=>{setSelectedEvent(e.id);setReply('');})}
        {selectedEvent===e.id&&<div style={{width:'100%'}}><textarea className={input} maxLength={1000} rows={3} value={reply} onChange={v=>setReply(v.target.value)} placeholder="Javob matni"/><div className="media-actions">{button('Javob yuborish',()=>void perform(()=>mediaApi(`/growth/events/${e.id}/action`,'POST',{action:'reply',response:reply}),'Javob yuborildi.'),busy||!reply.trim())}{e.kind==='comment'&&<>{button('Yashirish',()=>void perform(()=>mediaApi(`/growth/events/${e.id}/action`,'POST',{action:'hide'}),'Izoh yashirildi.'))}{button('Izohni o‘chirish',()=>{if(window.confirm('Instagramdagi izohni o‘chirasizmi?'))void perform(()=>mediaApi(`/growth/events/${e.id}/action`,'POST',{action:'delete'}),'Izoh o‘chirildi.');})}</>}</div></div>}
      </div>)}
    </section>
    <section className="media-panel"><div className="media-actions"><h2>Natijalar paneli</h2>{button('Yangilash',()=>void perform(async()=>{},'Panel yangilandi.'))}{button('Statistikani olish',()=>void perform(()=>mediaApi('/growth/insights/sync','POST',{account_id:account}),'Statistika fonda olinmoqda. Birozdan keyin Yangilash tugmasini bosing.'),busy||!account)}</div><p>Tizim orqali chiqarilgan oxirgi 30 postdan ma’lumot olinadi. Eng ko‘p saqlangan va ulashilgan mavzular keyingi reja uchun foydali.</p>
      <div style={{overflowX:'auto'}}><table className="growth-table"><thead><tr><th>Kontent</th><th>Ko‘rish</th><th>Qamrov</th><th>Like</th><th>Izoh</th><th>Saqlash</th><th>Ulashish</th></tr></thead><tbody>{[...(state?.insights||[])].sort((a,b)=>(b.metrics?.saved??-1)-(a.metrics?.saved??-1)).map((r:any)=><tr key={r.id}><td>{r.external_url?<a href={r.external_url} target="_blank" rel="noreferrer">{r.title}</a>:r.title}<small style={{display:'block'}}>Hook: {r.caption?.split('\n')[0]}</small><small style={{display:'block'}}>{r.collected_at?tashkentDate(r.collected_at):'Hali olinmagan'}</small>{r.errors&&Object.keys(r.errors).length>0&&<details><summary>Olinmagan metrikalar</summary>{Object.entries(r.errors).map(([k,v])=><p key={k}>{k}: {String(v)}</p>)}</details>}</td>{['views','reach','likes','comments','saved','shares'].map(k=><td key={k}>{r.metrics?.[k]??'—'}</td>)}</tr>)}</tbody></table></div>
    </section>
    <section className="media-panel"><h2>Platforma paketi va sifat nazorati</h2><p>Har platforma uchun alohida media nusxalarini saqlang. Post matni Kontentlar bo‘limida tahrirlanadi. Tekshiruv media fayllarni o‘zgartirmaydi.</p>
      <label className="media-field"><span>Kontent</span><select className={input} value={postId} onChange={e=>{setPostId(e.target.value);setQuality(null);setReview('');}}>{data.posts.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
      {postId&&<PlatformPackage key={postId} data={data} postId={postId} disabled={busy} onSave={v=>perform(async()=>{await mediaApi(`/posts/${postId}`,'PATCH',v);await onSaved();},'Platforma nusxalari saqlandi.')} />}
      <label className="media-field"><span>Tekshirish platformasi</span><select className={input} value={platform} onChange={e=>setPlatform(e.target.value)}><option value="telegram">Telegram</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option></select></label>
      <div className="media-actions">{button('Texnik tekshiruv',()=>void perform(async()=>setQuality(await mediaApi(`/posts/${postId}/quality`,'POST',{platform})),'Tekshiruv tugadi.'),busy||!postId)}{button('Arabcha va tarjimani AI tekshirsin',()=>void perform(async()=>{const r=await mediaApi<{review:string}>(`/posts/${postId}/language-review`,'POST',{});setReview(r.review);},'AI tavsiyasi tayyor.'),busy||!postId)}</div>
      <small>AI tekshiruvi OpenAI API sarfini ishlatadi. Matn kesimi va tasvir dizayni uchun yakuniy ko‘rish zarur.</small>
      {quality?.checks.map((c:any,i:number)=><div className="growth-check" key={i}><strong>{({pass:'✅',warning:'⚠️',error:'❌',manual:'👁️'} as any)[c.level]} {c.label}</strong><p>{c.detail}</p></div>)}
      {review&&<div className="growth-check" style={{whiteSpace:'pre-wrap'}}>{review}</div>}
    </section>
  </div>;
}
function PlatformPackage({data,postId,onSave,disabled}:{data:MediaData;postId:string;onSave:(v:any)=>Promise<void>;disabled:boolean}){
  const post=data.posts.find(p=>p.id===postId)!;
  const [selected,setSelected]=useState<Record<string,string[]>>(()=>Object.fromEntries(['telegram','instagram','youtube'].map(p=>[p,(post.variants as any)[`${p}_asset_ids`]||[]])));
  const published=post.deliveries.some(d=>d.status!=='cancelled');
  return <form onSubmit={e=>{e.preventDefault();const variants={...post.variants} as any;for(const p of ['telegram','instagram','youtube']){if(selected[p].length)variants[`${p}_asset_ids`]=selected[p];else delete variants[`${p}_asset_ids`];}void onSave({...post,variants});}}>
    <div className="media-form-grid">{['telegram','instagram','youtube'].map(p=><label className="media-field" key={p}><span>{p} media nusxasi</span><select className="media-input" multiple value={selected[p]} disabled={disabled||published} onChange={e=>setSelected({...selected,[p]:Array.from(e.target.selectedOptions,o=>o.value)})}>{data.assets.filter(a=>a.mime_type.startsWith('image/')||a.mime_type==='video/mp4').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><small>Bo‘sh tanlov: postning umumiy fayllari. Karusel tartibi shu ro‘yxat tartibida.</small></label>)}</div>
    <button className="media-btn secondary" disabled={disabled||published}>Platforma nusxalarini saqlash</button>{published&&<p>Rejalashtirilgan yoki yuborilgan post o‘zgartirilmaydi. Yangi nusxa uchun yangi kontent yarating.</p>}
  </form>;
}
