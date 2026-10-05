import { pool } from "../../db";
import { assetSignature, seal, unseal } from "./security";
import type { MediaPost } from "../../../shared/media";
export class PublishError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public ambiguous = false,
  ) {
    super(message);
  }
}
type Account = {
  id: string;
  platform: string;
  external_id: string;
  credentials: string | null;
};
type Asset = { id: string; mime_type: string; data: Buffer; size: number };
type State = Record<string, any>;
export function appBaseUrl() {
  const v =
    process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "");
  if (!v) throw new PublishError("APP_URL sozlamasi kerak.");
  const u = new URL(v.startsWith("http") ? v : `https://${v}`);
  if (u.protocol !== "https:" && process.env.NODE_ENV === "production")
    throw new PublishError("Saytning HTTPS manzili kerak.");
  return u.origin;
}
function publicAsset(id: string) {
  const expires = String(Date.now() + 7 * 86400000);
  return `${appBaseUrl()}/api/media/assets/${id}/public?expires=${expires}&sig=${assetSignature(id, expires)}`;
}
async function api(
  url: string,
  init: RequestInit = {},
  unsafe = false,
): Promise<any> {
  let res: globalThis.Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(120000) });
  } catch {
    throw new PublishError(
      "Platforma javobi olinmadi. Nashr holatini tekshiring.",
      !unsafe,
      unsafe,
    );
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new PublishError(
      "Platformadan kutilmagan javob. Nashr holatini tekshiring.",
      !unsafe,
      unsafe,
    );
  }
  if (!res.ok || data.ok === false || data.error) {
    const code = data.error?.code ?? data.error_code ?? res.status;
    if (code === 429 || res.status === 429)
      throw new PublishError(
        "Platforma limiti. Keyinroq qayta uriniladi.",
        true,
      );
    if (res.status >= 500)
      throw new PublishError(
        "Platforma vaqtincha ishlamayapti. Nashr holatini tekshiring.",
        !unsafe,
        unsafe,
      );
    throw new PublishError(
      `Platforma ruxsati yoki materialni tekshiring (kod: ${Number(code) || res.status}).`,
    );
  }
  return data;
}
async function telegram(method: string, body: any, unsafe = false) {
  if (!process.env.TELEGRAM_BOT_TOKEN)
    throw new PublishError("Telegram bot kaliti sozlanmagan.");
  return api(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    unsafe,
  );
}
function igCredentials(account: Account) {
  if (!account.credentials) throw new PublishError("Instagram kaliti kerak.");
  return unseal<{ access_token: string }>(account.credentials);
}
const igBase = () =>
  `https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION || "v23.0"}`;
async function ig(
  account: Account,
  path: string,
  body?: Record<string, string>,
  unsafe = false,
) {
  const { access_token } = igCredentials(account);
  return api(
    `${igBase()}/${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(body ? { body: new URLSearchParams(body) } : {}),
    },
    unsafe,
  );
}
export async function youtubeToken(account: Account) {
  if (
    !account.credentials ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  )
    throw new PublishError("YouTube OAuth sozlamalari kerak.");
  const c = unseal<{ refresh_token: string }>(account.credentials);
  const r = await api("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  return r.access_token as string;
}
export async function verifyAccount(account: Account) {
  if (account.platform === "telegram") {
    const [chat, me] = await Promise.all([
      telegram("getChat", { chat_id: account.external_id }),
      telegram("getMe", {}),
    ]);
    const member = await telegram("getChatMember", {
      chat_id: account.external_id,
      user_id: me.result.id,
    });
    if (
      chat.result.type === "channel" &&
      !(
        member.result.status === "creator" ||
        (member.result.status === "administrator" &&
          member.result.can_post_messages)
      )
    )
      throw new PublishError(
        "Botni kanalga post yubora oladigan admin qiling.",
      );
    if (["left", "kicked", "restricted"].includes(member.result.status))
      throw new PublishError("Botda xabar yuborish huquqi yo‘q.");
    return {
      external_id: String(chat.result.id),
      name: chat.result.title || account.external_id,
    };
  }
  if (account.platform === "instagram") {
    const r = await ig(account, `${account.external_id}?fields=id,username`);
    return { external_id: r.id, name: r.username || account.external_id };
  }
  const token = await youtubeToken(account);
  const r = await api(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.items?.[0]) throw new PublishError("YouTube kanali topilmadi.");
  return { external_id: r.items[0].id, name: r.items[0].snippet.title };
}
export async function publish(
  post: MediaPost,
  account: Account,
  assets: Asset[],
  state: State,
  save: (state: State) => Promise<void>,
) {
  const caption =
    post.variants[account.platform as "telegram" | "instagram" | "youtube"] ??
    post.caption;
  if (account.platform === "telegram") {
    const common = { chat_id: account.external_id };
    let r: any;
    if (post.format === "article")
      r = await telegram("sendRichMessage", {
        ...common,
        rich_message: { html: caption },
      }, true);
    else if (!assets.length)
      r = await telegram("sendMessage", { ...common, text: caption }, true);
    else if (assets.length > 1)
      r = await telegram(
        "sendMediaGroup",
        {
          ...common,
          media: assets.map((a, i) => ({
            type: "photo",
            media: publicAsset(a.id),
            ...(i === 0 ? { caption } : {}),
          })),
        },
        true,
      );
    else
      r = await telegram(
        assets[0].mime_type.startsWith("video/") ? "sendVideo" : "sendPhoto",
        {
          ...common,
          caption,
          [assets[0].mime_type.startsWith("video/") ? "video" : "photo"]:
            publicAsset(assets[0].id),
          supports_streaming: true,
        },
        true,
      );
    const result = Array.isArray(r.result) ? r.result[0] : r.result;
    const external_id = String(result.message_id),
      handle = result.chat?.username;
    return {
      external_id,
      external_url: handle ? `https://t.me/${handle}/${external_id}` : null,
    };
  }
  if (account.platform === "instagram") {
    if (!state.container_id) {
      let payload: Record<string, string> = { caption };
      if (assets.length > 1) {
        state.children = state.children || [];
        for (let i = state.children.length; i < assets.length; i++) {
          const r = await ig(account, `${account.external_id}/media`, {
            image_url: publicAsset(assets[i].id),
            is_carousel_item: "true",
          });
          state.children.push(r.id);
          await save(state);
        }
        payload = {
          ...payload,
          media_type: "CAROUSEL",
          children: state.children.join(","),
        };
      } else if (assets[0].mime_type.startsWith("video/"))
        payload = {
          ...payload,
          media_type: "REELS",
          video_url: publicAsset(assets[0].id),
        };
      else payload = { ...payload, image_url: publicAsset(assets[0].id) };
      state.container_id = (
        await ig(account, `${account.external_id}/media`, payload)
      ).id;
      await save(state);
    }
    const status = await ig(
      account,
      `${state.container_id}?fields=status_code`,
    );
    if (status.status_code === "IN_PROGRESS")
      throw new PublishError("Instagram videoni tayyorlamoqda.", true);
    if (status.status_code === "PUBLISHED")
      throw new PublishError(
        "Instagram konteyneri allaqachon nashr qilingan. Natijani tekshiring.",
        false,
        true,
      );
    if (status.status_code !== "FINISHED")
      throw new PublishError(
        "Instagram materialni qabul qilmadi. Format va sifatni tekshiring.",
      );
    const r = await ig(
      account,
      `${account.external_id}/media_publish`,
      { creation_id: state.container_id },
      true,
    );
    let url: string | null = null;
    try {
      url = (await ig(account, `${r.id}?fields=permalink`)).permalink || null;
    } catch {
      /* Published id is sufficient; do not resend. */
    }
    return { external_id: r.id, external_url: url };
  }
  const token = await youtubeToken(account),
    asset = assets[0];
  if (!state.upload_url) {
    let r: globalThis.Response;
    try {
      r = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Length": String(asset.size),
            "X-Upload-Content-Type": asset.mime_type,
          },
          body: JSON.stringify({
            snippet: {
              title: post.title,
              description: caption,
              categoryId: "27",
            },
            status: {
              privacyStatus: post.variants.youtube_privacy || "public",
              selfDeclaredMadeForKids:
                post.variants.youtube_made_for_kids || false,
              containsSyntheticMedia:
                post.variants.youtube_synthetic_media || false,
            },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      throw new PublishError("YouTube yuklash sessiyasi ochilmadi.", true);
    }
    if (!r.ok || !r.headers.get("location"))
      throw new PublishError("YouTube yuklash ruxsatini tekshiring.");
    const u = new URL(r.headers.get("location")!);
    if (u.protocol !== "https:" || u.hostname !== "www.googleapis.com")
      throw new PublishError("YouTube sessiya manzili noto‘g‘ri.");
    state.upload_url = u.href;
    await save(state);
  }
  let offset = 0;
  if (state.started) {
    let probe: globalThis.Response;
    try {
      probe = await fetch(state.upload_url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Range": `bytes */${asset.size}`,
          "Content-Length": "0",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new PublishError("YouTube sessiyasini tekshirib bo‘lmadi.", true);
    }
    if (probe.ok) {
      const r = await probe.json();
      return {
        external_id: r.id,
        external_url: `https://youtu.be/${r.id}`,
        note:
          r.status?.privacyStatus === "private"
            ? "YouTube yuklandi, lekin private. Ilova auditi va video holatini tekshiring."
            : undefined,
      };
    }
    if (probe.status !== 308)
      throw new PublishError(
        "YouTube sessiyasi tugagan. Avval kanalni tekshiring.",
        false,
        true,
      );
    offset =
      Number(probe.headers.get("range")?.match(/-(\d+)$/)?.[1] || "-1") + 1;
  }
  state.started = true;
  await save(state);
  const r = await api(
    state.upload_url,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": asset.mime_type,
        "Content-Length": String(asset.size - offset),
        "Content-Range": `bytes ${offset}-${asset.size - 1}/${asset.size}`,
      },
      body: new Uint8Array(asset.data.subarray(offset)),
    },
    false,
  );
  if (!r.id)
    throw new PublishError("YouTube javobini tekshiring.", false, true);
  return {
    external_id: r.id,
    external_url: `https://youtu.be/${r.id}`,
    note:
      r.status?.privacyStatus === "private"
        ? "YouTube yuklandi, lekin private. Ilova auditi va video holatini tekshiring."
        : undefined,
  };
}
export { seal };
