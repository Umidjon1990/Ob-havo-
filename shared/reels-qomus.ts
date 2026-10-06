import { reelPackageSchema } from "./reels";
export const qomusReel = reelPackageSchema.parse({
  source_url:"https://www.al-qomus.uz/",
  source_notes:"2026-10-06 jonli tekshiruv: نَكْتُبُ so‘zi كَتَبَ — يَكْتُبُ asl fe’lini topdi. كَتَبَ yozuvi — yozmoq, barcha ma’nolar va arabcha misollar o‘zbekcha tarjimasi bilan. /sarf/84507: moziy, muzori’, amr va nahiy jadvallari. Arabcha harakat bilan/harakatsiz va o‘zbekcha qidiruv bor. Barcha yozuvlar tarjima qilingan yoki barcha shakl topiladi deb da’vo qilinmasin.",
  hook:"Bu kabi lug‘atni aniq ko‘rmagansiz!",
  script:"[curious] Bu kabi lug‘atni aniq ko‘rmagansiz! Arabcha so‘zni hatto tuslangan shaklda yozing. Uning asl fe’li, ma’nosi va tuslanishini bir joyda toping. Batafsilini hozir ko‘rsataman.\n\nMasalan, نَكْتُبُ deb qidiring. Al-Qomus uning asl shaklini topadi: كَتَبَ — يَكْتُبُ, ya’ni yozmoq.\n\nMa’nolarni oching, arabcha misolni o‘qing va o‘zbekcha tarjimasini ko‘ring.\n\nEndi To‘liq tuslashni bosing. Moziy, muzori’, amr va nahiy shakllari jadvalda chiqadi.\n\nHarakat bilan ham, harakatsiz ham qidiring. O‘zbekcha so‘z orqali ham mos arabcha yozuvlarni topasiz.\n\nArab tilini o‘rganayotgan do‘stingizga yuboring! Havola uchun profilga obuna bo‘ling va izohga QOMUS yozing. Directdagi xabarni tekshiring.",
  target_seconds:48,
  scenes:[
    {kind:"hook",title:"Bunday lug‘atni ko‘rganmisiz?",body:"Tuslangan so‘z → asl fe’l",seconds:11,visual_prompt:"Premium 3D erkak talaba, ko‘k va firuza ta’lim studiyasi, telefon, jonli kamera. Hech qanday generativ matn yo‘q."},
    {kind:"search",title:"Asl fe’lni toping",body:"Asl fe’lning ma’nosi: yozmoq",arabic:"نَكْتُبُ ← كَتَبَ — يَكْتُبُ",seconds:9,visual_prompt:"Haqiqiy qidiruv ekrani, yozilish animatsiyasi va ma’no kartochkasi."},
    {kind:"example",title:"Ma’no + misol + tarjima",arabic:"كَتَبَ كِتَابًا",body:"U kitob yozdi.",seconds:4.5,visual_prompt:"Haqiqiy lug‘at yozuvi va yirik RTL misol kartochkasi."},
    {kind:"sarf",title:"Tuslanish bir joyda",arabic:"كَتَبَ  •  يَكْتُبُ  •  اُكْتُبْ",body:"Moziy · Muzori’ · Amr va nahiy",seconds:7,visual_prompt:"Haqiqiy Sarf jadvali, satrlar navbat bilan chiqadi."},
    {kind:"benefits",title:"Sizga qulay shaklda",arabic:"نَكْتُبُ  •  نكتب",body:"Harakat bilan · Harakatsiz · O‘zbekcha",seconds:6,visual_prompt:"Uchta izchil rangli qidiruv kartochkasi."},
    {kind:"cta",title:"Havola Directga!",body:"Profilga obuna bo‘ling. Izohga QOMUS yozing.",seconds:10.5,visual_prompt:"Yirik QOMUS kalit so‘zi, izohdan Directga harakatlanuvchi havola kartochkasi."},
  ],
  keywords:["QOMUS"], dm_text:"Al-Qomus — arabcha so‘z, ma’no, misol va fe’l tuslanishini bir joyda toping. Lug‘atga kirish:",
  link_url:"https://www.al-qomus.uz/", require_follow:true,automation_enabled:true,
  voice_id:"Rho2qPfhZy8UjudEdHC2",
});
export const qomusCaption = "Tuslangan arabcha so‘zning asl fe’lini topa olmayapsizmi? 🔎\n\nAl-Qomusda نَكْتُبُ deb qidirib, كَتَبَ — يَكْتُبُ fe’lini, ma’nosini, misollarini va tuslanishini ko‘ring.\n\n🔗 Havola uchun profilga obuna bo‘ling va izohga QOMUS yozing. Directdagi xabarga ko‘ra obunani tekshiring.\n\nZamonaviy ta’lim. Tuzuvchi: U. Abdurayimov\n\n#arabtili #arabcha #lugat #alqomus #zamonaviytalim";
