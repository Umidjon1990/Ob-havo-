import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../../db";
import { PublishError, youtubeAccess } from "./providers";
import { createYouTubePlaylist, listYouTubePlaylists, listYouTubePlaylistItems, moveYouTubePlaylistItem,
  youtubePlaylistId, youtubePlaylistInput } from "./youtube-playlists";

export function registerYouTubePlaylistRoutes(app: Express, route: (fn: (req: Request, res: Response) => Promise<any>) => RequestHandler) {
  async function connection(req: Request, write = false) {
    const id = z.string().uuid().parse(req.params.accountId);
    const account = (await pool.query("SELECT * FROM media_accounts WHERE id=$1", [id])).rows[0];
    if (!account || account.platform !== "youtube" || !account.enabled || !account.verified_at)
      throw new PublishError("Avval faol YouTube hisobini ulang va tekshiring.");
    const access = await youtubeAccess(account);
    if (write && access.playlist_write === false)
      throw new PublishError("Playlist boshqaruvi uchun Platformalar bo‘limida YouTube’ni Google orqali qayta ulang.");
    return { account, access };
  }
  const path = "/api/media/accounts/:accountId/youtube/playlists";
  app.get(path, route(async (req, res) => {
    const { account, access } = await connection(req);
    res.json({ playlists: await listYouTubePlaylists(access.token, account.external_id), can_manage: access.playlist_write });
  }));
  app.post(path, route(async (req, res) => {
    const input = youtubePlaylistInput.parse(req.body);
    const { account, access } = await connection(req, true);
    res.status(201).json(await createYouTubePlaylist(access.token, account.external_id, input));
  }));
  app.get(`${path}/:playlistId/items`, route(async (req, res) => {
    const playlistId = youtubePlaylistId.parse(req.params.playlistId);
    const { account, access } = await connection(req);
    res.json(await listYouTubePlaylistItems(access.token, playlistId, account.external_id));
  }));
  app.patch(`${path}/:playlistId/items/:itemId`, route(async (req, res) => {
    const playlistId = youtubePlaylistId.parse(req.params.playlistId),
      itemId = z.string().regex(/^[A-Za-z0-9_-]{1,300}$/).parse(req.params.itemId),
      input = z.object({ position: z.number().int().min(1).max(10000) }).parse(req.body);
    const { account, access } = await connection(req, true);
    res.json(await moveYouTubePlaylistItem(access.token, account.external_id, playlistId, itemId, input.position));
  }));
}
